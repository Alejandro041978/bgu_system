import { passingByCourse, passingFor } from '@/lib/passing-score'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { codigosDeMalla, codigoVisible } from '@/lib/course-code'
import { guardStaff } from '@/lib/api-guard'
import { normalizarEvaluaciones } from '@/lib/evaluaciones'
import { courseNameKey } from '@/lib/course-match'
import { numerarIntentos, etiquetaDeIntento } from '@/lib/intentos'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?student_id= → detalle de calificaciones del estudiante (con nombre de programa)
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })

  const sb = db()
  const [{ data: details }, { data: enr }, { data: stu }] = await Promise.all([
    sb.from('academic_grade_details')
      .select('id, external_id, enrollment_id, course_code, course_name, term_year, term_block, semester_id, final_grade, retake_grade, makeup_grade, extra_points, passing_score, max_score, grades, process_grades')
      .eq('student_id', studentId)
      .order('term_year', { ascending: false }).order('term_block', { ascending: false }).order('course_name'),
    sb.from('academic_student_enrollments').select('id, academic_programs(name)').eq('student_id', studentId),
    sb.from('academic_students').select('document_number').eq('id', studentId).maybeSingle(),
  ])

  // De academic_grades (misma inscripción por external_id): estado de retiro y
  // si la nota es editable (solo SystemActiva, no Moodle). Defensa: si faltan
  // columnas (migración sin correr), no filtra ni marca.
  const withdrawn = new Set<string>()
  const editableByExt = new Map<string, boolean>()
  // course_id por nota: es lo que permite mostrar el código de la malla
  // (STA 460) en vez del número de orden con el que llegó de SystemActiva (207).
  const cursoByExt = new Map<string, string | null>()
  const estadoByExt = new Map<string, { estado: string | null; rendido: number | null }>()
  const origenByExt = new Map<string, string | null>()
  // La NOTA oficial. academic_grade_details guarda su propia copia del número y
  // esa copia se quedó atrás en 467 filas: el Acta Detallada mostraba "—" en
  // asignaturas aprobadas. La fuente es academic_grades, que es la que usan el
  // acta personal, el cálculo de egresados y el estado académico.
  const notaByExt = new Map<string, { final: number | null; retake: number | null; passing: number | null }>()
  if (stu?.document_number) {
    const r = await sb.from('academic_grades').select('external_id, withdrawn_at, source, moodle_course_id, course_id, estado_academico, rendido_pct, final_grade, retake_grade, passing_score')
      .eq('document_number', stu.document_number)
    if (!r.error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const w of (r.data ?? []) as any[]) {
        if (w.withdrawn_at) withdrawn.add(String(w.external_id))
        editableByExt.set(String(w.external_id), w.source === 'systemactiva' && !w.moodle_course_id)
        cursoByExt.set(String(w.external_id), w.course_id ?? null)
        estadoByExt.set(String(w.external_id), { estado: w.estado_academico ?? null, rendido: w.rendido_pct ?? null })
        origenByExt.set(String(w.external_id), w.source ?? null)
        notaByExt.set(String(w.external_id), { final: w.final_grade ?? null, retake: w.retake_grade ?? null, passing: w.passing_score ?? null })
      }
    }
  }

  // ¿Hay alumno detrás de esta fila? Un valor por encima de cero acompañado de
  // al menos una evaluación rendida. Un cero con las doce casillas vacías no es
  // un cero: es una fila que nunca se usó.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tieneTrabajo = (d: any): boolean => {
    const v = d.retake_grade ?? d.final_grade
    if (v == null || Number(v) <= 0) return false
    const p = Array.isArray(d.process_grades) ? d.process_grades : []
    return p.some((x: { val?: number | null }) => x?.val != null && Number(x.val) > 0)
  }

  const progByEnr = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enr ?? []) as any[]) progByEnr.set(e.id, e.academic_programs?.name ?? 'Programa')

  // ── A qué programa pertenece cada asignatura ──────────────────────────────
  //
  // Se decidía solo por el enrollment_id de la fila de detalle, y 940 filas de
  // 42 estudiantes no lo tienen: caían todas en "Sin programa" aunque la nota
  // supiera perfectamente de qué programa es. Un Bachelor aparecía partido en
  // dos bloques, uno con su nombre y otro sin él (18/08/2026).
  //
  // La cadena va de lo más específico a lo más general y se detiene en cuanto
  // algo responde:
  //
  //   1. el enrollment de la fila, cuando lo hay;
  //   2. el course_id de la nota. Es el identificador que ata una asignatura a
  //      UN programa, y desde la separación del registro curricular es la vía
  //      fiable: 699 de las 940 se resuelven aquí;
  //   3. la única matrícula del estudiante. Solo si tiene una: 231 filas son
  //      de asignaturas que nunca llegaron a tener nota —el resto de la
  //      migración, con los códigos de orden de SystemActiva— y para quien
  //      lleva un solo programa no hay ambigüedad posible.
  //
  // Una asignatura pertenece SIEMPRE a un programa y solo a uno: el course_id
  // es lo que las distingue, y dos asignaturas pueden llamarse igual en
  // programas distintos. Así que "sin programa" no es un caso posible, es un
  // dato roto — y por eso el último escalón no es un cajón silencioso sino una
  // etiqueta que pide revisión. Tras descartar los restos de la migración, hoy
  // no lo alcanza ninguna fila.
  const cursoAPrograma = new Map<string, string>()
  const idsCurso = [...new Set([...cursoByExt.values()].filter(Boolean).map(String))]
  for (let i = 0; i < idsCurso.length; i += 300) {
    const { data: cs } = await sb.from('academic_courses')
      .select('id, academic_programs(name)').in('id', idsCurso.slice(i, i + 300))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cs ?? []) as any[]) {
      if (c.academic_programs?.name) cursoAPrograma.set(String(c.id), c.academic_programs.name)
    }
  }
  const programasDelAlumno = [...new Set([...progByEnr.values()])]
  const unicoPrograma = programasDelAlumno.length === 1 ? programasDelAlumno[0] : null

  const programaDe = (externalId: string, enrollmentId: string | null): string => {
    if (enrollmentId && progByEnr.has(enrollmentId)) return progByEnr.get(enrollmentId)!
    const cid = cursoByExt.get(externalId)
    if (cid && cursoAPrograma.has(String(cid))) return cursoAPrograma.get(String(cid))!
    return unicoPrograma ?? 'Programa sin identificar · revisar'
  }

  const malla = await codigosDeMalla(sb, [...cursoByExt.values()])
  // La nota mínima que se muestra es la REGLA de la categoría del programa, no
  // el número que vino pegado a la fila desde SystemActiva. Ese decía 75 en
  // Bachelor mientras el ERP declara 70, y era el que aparecía en el acta.
  const porCurso = await passingByCourse(sb)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Una asignatura CONVALIDADA o VALIDADA no se cursa, así que su inscripción
  // vieja no debe seguir apareciendo "En curso" en el acta detallada.
  //
  // Renzo tenía English Composition I validada con 70 y, además, una
  // inscripción vacía heredada de SystemActiva. El acta personal mostraba
  // "Validation" —prefiere la validación— y la detallada mostraba "En curso"
  // —solo ve el detalle—. Ninguna de las dos mentía: eran dos registros de la
  // misma asignatura, y la pantalla que no sabía de validaciones enseñaba el
  // que sobraba.
  const resueltas = new Set<string>()
  if (stu?.document_number) {
    const { data: rv } = await sb.from('academic_grades')
      .select('course_name, source').eq('document_number', stu.document_number)
      .in('source', ['validacion', 'convalidacion'])
    for (const r of (rv ?? []) as { course_name: string | null }[]) {
      if (r.course_name) resueltas.add(courseNameKey(r.course_name))
    }
  }

  // Qué intento es cada fila. Se deriva del periodo porque las filas heredadas
  // de SystemActiva llegaron como inscripciones sueltas y todas dicen "1": sin
  // esto, el acta mostraba dos veces la misma asignatura sin distinguir el
  // recursado del curso original.
  const intentoDe = new Map<string, number>()
  {
    // El orden temporal sale del SEMESTRE, no de año+bloque: esos dos se
    // contradecían en 6.747 filas y la numeración de intentos depende de
    // saber cuál fue primero.
    const { data: sems } = await sb.from('academic_semesters').select('id, start_date')
    const inicioDe = new Map<string, string>()
    for (const s of (sems ?? []) as { id: string; start_date: string | null }[]) {
      if (s.start_date) inicioDe.set(String(s.id), String(s.start_date))
    }
    const porCurso = new Map<string, Record<string, unknown>[]>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of (details ?? []) as any[]) {
      const k = courseNameKey(d.course_name)
      if (!porCurso.has(k)) porCurso.set(k, [])
      // La nota y lo rendido viven en academic_grades: sin ellos no se puede
      // saber si la fila es un intento real o una inscripción vacía.
      const oficial = notaByExt.get(String(d.external_id))
      porCurso.get(k)!.push({
        ...d,
        final_grade: oficial?.final ?? d.final_grade,
        retake_grade: oficial?.retake ?? d.retake_grade,
        rendido_pct: estadoByExt.get(String(d.external_id))?.rendido ?? null,
        orden: d.semester_id ? (inicioDe.get(String(d.semester_id)) ?? null) : null,
      })
    }
    for (const grupo of porCurso.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of numerarIntentos(grupo as any[])) intentoDe.set(String(f.external_id), f.intento_calc)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((details ?? []) as any[])
    .filter(d => !withdrawn.has(String(d.external_id)))
    // Solo se oculta la inscripción SIN nota: si tiene calificaciones, es un
    // hecho académico y debe verse aunque además esté validada — justamente el
    // caso que el auditor de vínculos señala para que alguien lo revise.
    .filter(d => !(resueltas.has(courseNameKey(d.course_name)) && d.final_grade == null))
    // Restos de la migración: filas de detalle cuya NOTA ya no existe.
    //
    // Al separar el registro curricular de las calificaciones se sacaron 6.638
    // inscripciones sin calificar de academic_grades, pero su detalle se quedó
    // aquí: 7.079 filas de 1.559 estudiantes que el acta seguía dibujando como
    // asignaturas "En curso" sin nota. Son las que aparecían bajo "Sin
    // programa", porque una fila sin nota no tiene course_id que consultar.
    //
    // No se ocultan todas a ciegas. Se conserva la que tenga TRABAJO detrás
    // —una nota mayor que cero con alguna evaluación rendida—, porque esa no es
    // un resto sino una calificación que perdió su fila y hay que verla para
    // poder arreglarla. Son 3 en toda la base; las otras 7.076 no tienen ni una
    // evaluación por encima de cero.
    .filter(d => notaByExt.has(String(d.external_id)) || tieneTrabajo(d))
    .map(d => {
  // Las evaluaciones se normalizan al leer: fuera el "Total" sintético del
  // importador y fuera el agrupamiento de proceso de SystemActiva. Los pesos
  // que llegan a la pantalla suman 100%, que es la regla de la casa.
  const ev = normalizarEvaluaciones(d.grades, d.process_grades)
  return {
    ...d,
    grades: ev.grades,
    process_grades: ev.process_grades,
    total_pct: ev.total_pct,
    ajuste_pesos: ev.ajuste,
    intento: intentoDe.get(String(d.external_id)) ?? 1,
    intento_label: etiquetaDeIntento(intentoDe.get(String(d.external_id)) ?? 1),
    descuadrado: ev.descuadrado,
    course_code: codigoVisible(cursoByExt.get(String(d.external_id)), malla, d.course_code),
    // El nombre también es el de la malla (única fuente de nombres); el que
    // trajo el sistema de origen queda aparte por si difiere.
    course_name: malla.get(String(cursoByExt.get(String(d.external_id)) ?? ''))?.name ?? d.course_name,
    source_name: (() => {
      const mn = malla.get(String(cursoByExt.get(String(d.external_id)) ?? ''))?.name
      return mn && courseNameKey(mn) !== courseNameKey(d.course_name) ? d.course_name : null
    })(),
    program_name: programaDe(String(d.external_id), d.enrollment_id ?? null),
    editable: editableByExt.get(String(d.external_id)) ?? false,
    // El ORIGEN real de la nota. La pantalla lo rotulaba "SystemActiva" a
    // secas, así que una nota recién traída de Moodle seguía diciendo que
    // venía del sistema apagado.
    origen: origenByExt.get(String(d.external_id)) ?? null,
    estado_academico: estadoByExt.get(String(d.external_id))?.estado ?? null,
    rendido_pct: estadoByExt.get(String(d.external_id))?.rendido ?? null,
    final_grade: notaByExt.has(String(d.external_id)) ? notaByExt.get(String(d.external_id))!.final : d.final_grade,
    retake_grade: notaByExt.has(String(d.external_id)) ? notaByExt.get(String(d.external_id))!.retake : d.retake_grade,
    passing_score: passingFor(
      { course_id: cursoByExt.get(String(d.external_id)) ?? null, passing_score: notaByExt.get(String(d.external_id))?.passing ?? d.passing_score },
      porCurso,
    ),
  }
  })

  return NextResponse.json({ details: rows })
}
