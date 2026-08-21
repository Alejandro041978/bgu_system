import { computeActa, creditosExtraPorIntentos, creditosQueLleva } from '@/lib/acta'
import { passingByCourse, passingFor } from '@/lib/passing-score'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { filaDeCurso, sameCourse, courseNameKey } from '@/lib/course-match'
import { esFilaDePlan } from '@/lib/grade-sources'
import { etiquetaIntento } from '@/lib/grades-write'
import { sincronizarEstadoDeMatricula } from '@/lib/course-enrollments'
import { guardStaff, guardSuperadmin } from '@/lib/api-guard'
import { guardPagina } from '@/lib/page-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gradeStatus(g: any, passing: number | null): { status: string; grade: number | null; has_grade: boolean } {
  const v = (g.retake_grade ?? g.final_grade) as number | null
  // La fila de plan ocupa su lugar en el registro sin fingir actividad: la
  // asignatura está inscrita en su malla, pero no empezada.
  if (esFilaDePlan(g)) return { status: 'no_iniciada', grade: null, has_grade: false }
  if (v == null) return { status: 'en_proceso', grade: null, has_grade: false }
  // El estado calculado manda: la nota del campus es un acumulado sobre el
  // 100% del curso, no un promedio de lo rendido.
  if (g.estado_academico === 'pendiente') return { status: 'en_proceso', grade: v, has_grade: true }
  if (g.estado_academico === 'aprobado') return { status: 'aprobado', grade: v, has_grade: true }
  if (g.estado_academico === 'reprobado') return { status: 'desaprobado', grade: v, has_grade: true }
  const p = g.passing_score ?? passing
  const ok = p != null ? Number(v) >= Number(p) : true
  return { status: ok ? 'aprobado' : 'desaprobado', grade: v, has_grade: true }
}

// GET ?student_id=&program_id= → inscripciones (academic_grades) del estudiante
// que pertenecen a la malla del programa + resumen de créditos/precio.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const studentId = req.nextUrl.searchParams.get('student_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!studentId || !programId) return NextResponse.json({ error: 'Falta student_id o program_id' }, { status: 400 })

  const { data: student } = await sb.from('academic_students').select('document_number').eq('id', studentId).maybeSingle()
  if (!student?.document_number) return NextResponse.json({ error: 'Estudiante sin documento' }, { status: 404 })

  const { data: program } = await sb.from('academic_programs').select('id, name, category_id').eq('id', programId).maybeSingle()
  let categoryPassing: number | null = null
  if (program?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', program.category_id).maybeSingle()
    categoryPassing = cat?.passing_score ?? null
  }

  const { data: courses } = await sb.from('academic_courses').select('id, code, name, credits, level').eq('program_id', programId)
    .order('level', { ascending: true, nullsFirst: false }).order('code')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const malla = (courses ?? []) as any[]
  // Qué notas son de ESTE programa: lo decide filaDeCurso —course_id, y el
  // nombre solo cuando no lo hay—. Nunca el código: son números de orden, y un
  // estudiante con dos programas los tiene repetidos 101–105 en los dos, así
  // que por código veía las doce filas de sus dos mallas en cada uno.
  const belongs = (g: { course_name: string | null; course_id: string | null }) => malla.some(c => filaDeCurso(g, c))

  const { data: grades } = await sb.from('academic_grades')
    .select('external_id, course_id, course_code, course_name, credits, term_year, term_block, final_grade, retake_grade, passing_score, withdrawn_at, source, moodle_course_id, estado_academico, intento, semester_id')
    .eq('document_number', student.document_number).neq('source', 'convalidacion').neq('source', 'validacion')

  // Parciales del Acta Detallada (misma inscripción por external_id): una
  // asignatura con evaluaciones con valor TAMBIÉN tiene notas (no solo la final).
  const { data: dets } = await sb.from('academic_grade_details')
    .select('external_id, grades, process_grades, makeup_grade').eq('student_id', studentId)

  const { data: semRows } = await sb.from('academic_semesters').select('id, name')
  const nombreSem = new Map((semRows ?? []).map((s: { id: string; name: string }) => [String(s.id), String(s.name)]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasSlot = (arr: any) => Array.isArray(arr) && arr.some((s: any) => s && s.val != null)
  const partialsByExt = new Map<string, boolean>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (dets ?? []) as any[]) partialsByExt.set(String(d.external_id), hasSlot(d.grades) || hasSlot(d.process_grades) || d.makeup_grade != null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((grades ?? []) as any[]).filter(belongs).map(g => {
    const st = gradeStatus(g, categoryPassing)
    const has_grade = st.has_grade || (partialsByExt.get(String(g.external_id)) ?? false)
    // La asignatura de la malla a la que corresponde la fila. Existe siempre:
    // `belongs` ya la exigió para dejar pasar la nota.
    //
    // De ella salen el código Y los créditos, y no de la fila. El crédito de la
    // fila viene de SystemActiva y en 840 filas no coincide con el de la malla:
    // las de un ABA de 2 créditos por asignatura decían 1, así que el registro
    // curricular contaba la mitad de la carga real. La malla es el documento
    // que fija cuánto vale cada asignatura; la nota solo dice cómo le fue.
    const cm = malla.find((c: { id: string; name: string | null; code: string | null; credits: number | null }) => filaDeCurso(g, c))
    return {
      external_id: g.external_id,
      // El código de la malla, no el número de orden de SystemActiva.
      course_code: cm?.code ?? g.course_code,
      course_name: g.course_name,
      credits: cm?.credits != null ? Number(cm.credits) : (g.credits != null ? Number(g.credits) : null),
      // El recursado se distingue del primer intento en el propio registro:
      // los dos existen y el acta se queda con el mejor.
      // El periodo sale del semestre; año+bloque se contradecían en 6.747 filas.
      term: [etiquetaIntento(g.intento), g.semester_id ? (nombreSem.get(String(g.semester_id)) ?? null) : null].filter(Boolean).join(' · '),
      status: st.status, grade: st.grade, has_grade, withdrawn: !!g.withdrawn_at,
      // Solo se editan/borran notas importadas de SystemActiva (no las de Moodle)
      editable: g.source === 'systemactiva' && !g.moodle_course_id,
      final_grade: g.final_grade, retake_grade: g.retake_grade,
      kind: (esFilaDePlan(g) ? 'sin_registrar' : 'inscripcion') as 'inscripcion' | 'sin_registrar',
      _clave: `${g.course_id ?? courseNameKey(g.course_name)}|${g.intento ?? 1}`,
      _vacia: !has_grade && !g.moodle_course_id,
    }
  })

  // ---------------------------------------------------------------------------
  // Una inscripción, una línea.
  //
  // La misma asignatura del mismo intento puede tener dos filas: la heredada de
  // SystemActiva y la del campus. No son dos matrículas ni un recursado —el
  // recursado lleva intento=2, y de ésos hay 138 en todo el ERP—, es el mismo
  // curso anotado dos veces. Pasa en 193 casos y 53 estudiantes.
  //
  // Se muestra la que tiene la nota y se calla la vacía. Pero no se descarta sin
  // más: la fila heredada es la que trae el PERIODO —la del campus llega sin
  // semestre—, así que primero se le hereda el término a la que se queda. Si se
  // ocultara a secas, el registro perdería el "AY 23-24 SUMMER 2024" que hoy se
  // ve en pantalla.
  //
  // Se resuelve al leer y no borrando filas: la fila heredada es el documento de
  // su matrícula en el sistema viejo y no estorba mientras no se muestre dos
  // veces. Y si el retiro de una se deshace, esto sigue valiendo solo.
  // ---------------------------------------------------------------------------
  const porClave = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!porClave.has(r._clave)) porClave.set(r._clave, [])
    porClave.get(r._clave)!.push(r)
  }
  const visibles = rows.filter(r => {
    // Una retirada nunca se esconde: es un acto deliberado, vive en su propia
    // sección y desde ahí se deshace. Solo se colapsa lo que está activo.
    if (r.withdrawn || !r._vacia) return true
    const activas = porClave.get(r._clave)!.filter(o => !o.withdrawn)
    return activas.length < 2 || !activas.some(o => !o._vacia)
  })
  for (const r of visibles) {
    if (r.term) continue
    const sombra = porClave.get(r._clave)!.find(o => o !== r && o.term)
    if (sombra) r.term = sombra.term
  }

  // El registro curricular es TODO el registro. Las convalidadas son parte de
  // él —no se pueden retirar, pero existir existen— y las asignaturas de la
  // malla sin ninguna fila también: un bachiller matriculado tiene 40
  // asignaturas, aunque diez todavía no se le hayan inscrito. Ocultarlas hacía
  // parecer que su plan de estudios era de 10.
  const { data: tcs } = await sb.from('transfer_credits')
    .select('id').eq('student_id', studentId).eq('dest_program_id', programId).eq('status', 'active')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let convItems: any[] = []
  if ((tcs ?? []).length) {
    const { data: its } = await sb.from('transfer_credit_items')
      .select('id, transfer_credit_id, dest_course_id, dest_course_name, origin_course_name, converted_grade')
      .in('transfer_credit_id', (tcs ?? []).map((t: { id: string }) => t.id))
    convItems = its ?? []
  }

  const convRows = convItems.map(i => {
    const c = malla.find((x: { id: string; name: string }) => x.id === i.dest_course_id || sameCourse(i.dest_course_name, x.name))
    return {
      external_id: `conv:${i.id}`,
      course_code: c?.code ?? null, course_name: c?.name ?? i.dest_course_name,
      credits: c?.credits != null ? Number(c.credits) : null,
      term: i.origin_course_name ? `Convalidada · ${i.origin_course_name}` : 'Convalidada',
      status: 'convalidado', grade: i.converted_grade != null ? Number(i.converted_grade) : null,
      has_grade: true, withdrawn: false, editable: false,
      final_grade: i.converted_grade ?? null, retake_grade: null,
      kind: 'convalidacion' as const,
    }
  })

  // Retiradas que viven SOLO en el registro (sin fila de notas).
  //
  // La sección de retiradas se alimentaba de las notas con withdrawn_at, y una
  // asignatura puede estar retirada sin tener nota: la liquidación de IW y la
  // limpieza de ceros de Activa retiran la matrícula (status 'retirada' en
  // academic_course_enrollments) y la nota o nunca existió o se borró. Esas
  // desaparecían de la sección —y peor: al no tener fila caían en "No
  // iniciada", que es lo contrario de un retiro (20/08/2026). El registro
  // curricular tiene que leer del REGISTRO.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matsReg } = await sb.from('academic_course_enrollments')
    .select('id, course_id, status, closed_by, closed_at')
    .eq('student_id', studentId).eq('program_id', programId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matsRet = ((matsReg ?? []) as any[]).filter(m => m.status === 'retirada')
  // Matrículas vivas: la asignatura ESTÁ inscrita aunque no tenga fila de
  // nota. El aviso de cobertura contaba filas y a Samuel Tejada le decía
  // "faltan 11 por inscribir" con las 11 matriculadas (21/08/2026).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursosVivos = new Set(((matsReg ?? []) as any[]).filter(m => m.status !== 'retirada').map(m => String(m.course_id)))
  const cursoDeMalla = new Map(malla.map(c => [String(c.id), c]))
  const yaRetiradaEnNotas = new Set(visibles.filter(r => r.withdrawn).map(r => courseNameKey(r.course_name)))
  const motivoDe = (cb: string | null) => {
    const s = String(cb ?? '')
    if (s === 'cero-relleno-activa') return 'Retirada · limpieza de ceros de Activa'
    if (s.startsWith('gestor-iw')) return 'Retirada · gestor IW'
    if (s.startsWith('reentry')) return 'Retirada · re-entry'
    return 'Retirada'
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retiradasRegistro = (matsRet as any[])
    .filter(m => cursoDeMalla.has(String(m.course_id)))
    .filter(m => !yaRetiradaEnNotas.has(courseNameKey(cursoDeMalla.get(String(m.course_id))!.name)))
    .map(m => {
      const c = cursoDeMalla.get(String(m.course_id))!
      return {
        external_id: `enr:${m.id}`, course_code: c.code, course_name: c.name,
        credits: c.credits != null ? Number(c.credits) : null,
        term: `${motivoDe(m.closed_by)}${m.closed_at ? ` · ${String(m.closed_at).slice(0, 10)}` : ''}`,
        status: 'retirada', grade: null, has_grade: false, withdrawn: true, editable: false,
        final_grade: null, retake_grade: null, kind: 'inscripcion' as const,
      }
    })

  // Lo que la malla tiene y el estudiante no: ni nota, ni convalidación, ni
  // retiro en el registro.
  const conFila = new Set([...visibles, ...convRows, ...retiradasRegistro].map(r => courseNameKey(r.course_name)))
  // Con matrícula viva pero sin fila de nota: inscrita, no "por inscribir".
  const inscritasSinFila = malla
    .filter(c => !conFila.has(courseNameKey(c.name)) && cursosVivos.has(String(c.id)))
    .map(c => ({
      external_id: `insc:${c.id}`, course_code: c.code, course_name: c.name,
      credits: c.credits != null ? Number(c.credits) : null,
      term: 'Inscrita · sin calificaciones',
      status: 'inscrita', grade: null, has_grade: false, withdrawn: false, editable: false,
      final_grade: null, retake_grade: null, kind: 'inscripcion' as const,
    }))
  const faltantes = malla.filter(c => !conFila.has(courseNameKey(c.name)) && !cursosVivos.has(String(c.id))).map(c => ({
    external_id: `falta:${c.id}`, course_code: c.code, course_name: c.name,
    credits: c.credits != null ? Number(c.credits) : null, term: '',
    status: 'no_iniciada', grade: null, has_grade: false, withdrawn: false, editable: false,
    final_grade: null, retake_grade: null, kind: 'sin_registrar' as const,
  }))

  // Se devuelve en el orden de la malla (nivel, código); lo que no está en la
  // malla —notas sueltas de la carga histórica— va al final.
  const orden = new Map(malla.map((c, i) => [courseNameKey(c.name), i]))
  const todas = [...visibles, ...convRows, ...retiradasRegistro, ...inscritasSinFila, ...faltantes]
    .sort((a, b) => (orden.get(courseNameKey(a.course_name)) ?? 9999) - (orden.get(courseNameKey(b.course_name)) ?? 9999)
      || String(a.course_name).localeCompare(String(b.course_name)))

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, list_price, credit_rate, credit_rate_source').eq('student_id', studentId).eq('program_id', programId)
    .order('list_price', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()

  // Créditos activos: se cuenta cada ASIGNATURA una vez, no cada fila. Sumar
  // filas inflaba la carga en dos casos corrientes —el recursado, que son dos
  // filas de la misma asignatura y no el doble de trabajo, y la fila de plan
  // que se quedó junto a la nota real (48 casos, 19 estudiantes)—.
  const creditoPorAsignatura = new Map<string, number>()
  for (const r of visibles) {
    if (r.withdrawn) continue
    const k = courseNameKey(r.course_name)
    if (!creditoPorAsignatura.has(k)) creditoPorAsignatura.set(k, r.credits ?? 0)
  }
  const creditosActivos = [...creditoPorAsignatura.values()].reduce((s, v) => s + v, 0)

  // El precio oficial se CALCULA, igual que en el estado de cuenta: tarifa
  // congelada × créditos que el estudiante lleva. El snapshot list_price decía
  // 23.040 —la malla entera— a una estudiante con 20 convalidadas y 10 en
  // curso, así que esta pantalla y su estado de cuenta se contradecían.
  let listPrice: number | null = enr?.list_price != null ? Number(enr.list_price) : null
  let creditosQueLlevaTotal: number | null = null
  if (enr?.credit_rate != null) {
    try {
      const acta = await computeActa(sb, studentId, programId)
      if (acta) {
        // Los recursados consumen créditos otra vez, misma regla que el
        // estado de cuenta.
        creditosQueLlevaTotal = creditosQueLleva(acta) + await creditosExtraPorIntentos(sb, studentId, programId)
        // Sin `> 0`, y a propósito: cero créditos son cero de tuition. La
        // condición confundía "no pude calcularlo" con "lo calculé y da cero",
        // y al retirado de todo le devolvía el precio congelado de su matrícula.
        // Misma regla que el estado de cuenta.
        listPrice = Math.round(Number(enr.credit_rate) * creditosQueLlevaTotal * 100) / 100
      }
    } catch { /* sin acta calculable se cae al snapshot */ }
  }

  return NextResponse.json({
    program: program?.name ?? '',
    enrollment: enr ? { id: enr.id, list_price: listPrice, credit_rate: enr.credit_rate != null ? Number(enr.credit_rate) : null } : null,
    creditos_activos: creditosActivos,
    creditos_que_lleva: creditosQueLlevaTotal,
    // Cobertura del registro: un matriculado no retirado debería tener las
    // asignaturas de su malla completas, aunque muchas sigan sin empezar.
    malla_total: malla.length,
    sin_registrar: faltantes.length,
    // Sin los campos de trabajo (_clave, _vacia): son para agrupar aquí, no
    // parte del registro que ve nadie.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: todas.map(({ _clave, _vacia, ...r }: any) => r),
  })
}

// PATCH { external_id, final_grade } → edita/borra la nota (final_grade null = borrar).
// SOLO notas importadas de SystemActiva (source='systemactiva', sin moodle_course_id):
// las de Moodle no se tocan aquí. Escribe edited_at para que el sync no la pise
// y actualiza ambas tablas (academic_grades + academic_grade_details) por external_id.
// Escribe final_grade a mano sobre una inscripción de SystemActiva: es una
// edición de nota como cualquier otra, así que solo superadmin.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardSuperadmin()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { external_id?: string; final_grade?: number | null } | null
  if (!b?.external_id) return NextResponse.json({ error: 'Falta external_id' }, { status: 400 })

  const sb = db()
  const { data: g } = await sb.from('academic_grades')
    .select('external_id, source, moodle_course_id, withdrawn_at').eq('external_id', b.external_id).maybeSingle()
  if (!g) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
  if (g.source !== 'systemactiva' || g.moodle_course_id) {
    return NextResponse.json({ error: 'Solo se pueden editar notas importadas de SystemActiva (las de Moodle no se editan aquí)' }, { status: 403 })
  }

  // Validar la nota (vacío/null = borrar)
  let fg: number | null = null
  if (b.final_grade !== null && b.final_grade !== undefined && String(b.final_grade) !== '') {
    const n = Number(b.final_grade)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'Nota inválida' }, { status: 400 })
    fg = n
  }

  // El estado se recalcula aquí mismo.
  //
  // Antes solo se escribía la nota, y estado_academico se quedaba con el valor
  // viejo. El acta prefiere ese estado guardado sobre comparar la nota, así que
  // una asignatura recién vaciada seguía mostrándose "Desaprobado" con un
  // guion donde debía ir la calificación — un estado sin nota que lo sostenga.
  //
  // Sin nota no hay veredicto: es un hueco esperando a que Moodle lo llene, y
  // eso en el acta es "En curso".
  const { data: fila } = await sb.from('academic_grades')
    .select('course_id').eq('external_id', b.external_id).maybeSingle()
  const min = passingFor({ course_id: fila?.course_id ?? null }, await passingByCourse(sb))
  const estado = fg === null ? 'pendiente' : (min != null && fg >= min ? 'aprobado' : 'reprobado')

  const patch = {
    final_grade: fg, retake_grade: null,
    edited_at: new Date().toISOString(), edited_by: user.id,
    estado_academico: estado,
    // Al vaciar se borran también las evaluaciones parciales, así que el
    // porcentaje rendido que hubiera queda sin respaldo.
    ...(fg === null ? { rendido_pct: null } : {}),
  }
  const { error } = await sb.from('academic_grades').update(patch).eq('external_id', b.external_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Reflejar en el Acta Detallada (misma inscripción por external_id). Al BORRAR
  // (fg=null) se limpia TODO el curso — final, recuperación, subsanación, puntos
  // extra y las evaluaciones parciales — para que no queden notas colgando.
  const detailPatch = fg === null
    ? { final_grade: null, retake_grade: null, makeup_grade: null, extra_points: null, grades: [], process_grades: [] }
    : { final_grade: fg, retake_grade: null }
  await sb.from('academic_grade_details').update(detailPatch).eq('external_id', b.external_id).then(() => null, () => null)

  return NextResponse.json({ ok: true, final_grade: fg, cleared: fg === null })
}

// POST { external_id, student_id, program_id } → retira la asignatura (sin notas)
// Recalcula el Total Tuition: list_price de la matrícula −= tarifa × créditos.
export async function POST(req: NextRequest) {
  // Retirar saca créditos del registro y baja el precio oficial: pide el permiso
  // de edición sobre Registro Curricular. guardStaff() solo preguntaba "hay
  // sesión y no es estudiante", que con el permisionador en modo auditoría es
  // cualquiera que entre al ERP.
  const noAutorizado = await guardPagina('academic_curricular')
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { external_id?: string; student_id?: string; program_id?: string } | null
  if (!b?.external_id || !b?.student_id || !b?.program_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const sb = db()
  const { data: g } = await sb.from('academic_grades')
    .select('external_id, document_number, credits, final_grade, retake_grade, withdrawn_at, source').eq('external_id', b.external_id).maybeSingle()
  if (!g) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
  if (g.source === 'convalidacion' || g.source === 'validacion') return NextResponse.json({ error: 'Una convalidación/validación no se retira aquí' }, { status: 400 })
  // De una asignatura no empezada no hay nada que retirar: no ocupa crédito ni
  // entra en el precio. Sacarla del registro sería dejar la malla incompleta.
  if (esFilaDePlan(g)) return NextResponse.json({ error: 'Esa asignatura todavía no está empezada: no hay nada que retirar' }, { status: 400 })
  if (g.withdrawn_at) return NextResponse.json({ error: 'Esta asignatura ya está retirada' }, { status: 409 })
  // Compuerta: solo si NO hay calificaciones — ni final/recuperación...
  if (g.final_grade != null || g.retake_grade != null) {
    return NextResponse.json({ error: 'No se puede retirar: la asignatura ya tiene calificaciones. Bórralas con "Editar nota" (vacío) primero.' }, { status: 409 })
  }
  // ...ni parciales con valor en el Acta Detallada (evaluaciones, subsanación).
  const { data: det } = await sb.from('academic_grade_details')
    .select('grades, process_grades, makeup_grade').eq('external_id', b.external_id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasSlot = (arr: any) => Array.isArray(arr) && arr.some((s: any) => s && s.val != null)
  if (det && (hasSlot(det.grades) || hasSlot(det.process_grades) || det.makeup_grade != null)) {
    return NextResponse.json({ error: 'No se puede retirar: la asignatura tiene evaluaciones/parciales con nota. Bórralas con "Editar nota" (vacío) primero.' }, { status: 409 })
  }
  // La inscripción debe ser del estudiante indicado
  const { data: stu } = await sb.from('academic_students').select('document_number').eq('id', b.student_id).maybeSingle()
  if (!stu || String(stu.document_number) !== String(g.document_number)) {
    return NextResponse.json({ error: 'La inscripción no pertenece a ese estudiante' }, { status: 400 })
  }

  // Marcar retirada. OJO: el trigger protect_edited_grades rechaza cualquier
  // update de una fila con edited_at si el update NO cambia edited_at (para que
  // el sync no pise correcciones). Como al borrar la nota se escribió edited_at,
  // hay que bumpearlo aquí también, si no el withdrawn_at se bloquea en silencio.
  const now = new Date().toISOString()
  const { error: wErr } = await sb.from('academic_grades')
    .update({ withdrawn_at: now, withdrawn_by: user.email ?? user.id, edited_at: now, edited_by: user.id }).eq('external_id', b.external_id)
  if (wErr) return NextResponse.json({ error: 'Falta correr course_withdrawal.sql: ' + wErr.message }, { status: 400 })
  // Verifica que realmente se marcó (por si el trigger u otra regla lo bloqueó)
  const { data: check } = await sb.from('academic_grades').select('withdrawn_at').eq('external_id', b.external_id).maybeSingle()
  if (!check?.withdrawn_at) return NextResponse.json({ error: 'No se pudo marcar el retiro (regla de protección). Reporta este caso.' }, { status: 409 })

  // Y sacarla del REGISTRO, que es de donde sale el precio oficial desde el
  // 15-08-2026. Marcar la nota ya no basta: el acta pregunta si la asignatura
  // está en academic_course_enrollments, no si existe una fila de nota. Sin
  // esto el retiro no bajaba nada —la matrícula seguía diciendo 'en_curso'— y
  // la reconstrucción nocturna tampoco lo arreglaba, porque solo crea las que
  // faltan y no toca las que ya existen.
  await sincronizarEstadoDeMatricula(sb, b.external_id)

  // Recalcular Total Tuition: bajar list_price por tarifa × créditos
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, list_price, credit_rate').eq('student_id', b.student_id).eq('program_id', b.program_id)
    .order('list_price', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()

  let delta = 0, new_list_price: number | null = null
  const credits = g.credits != null ? Number(g.credits) : 0
  if (enr && enr.list_price != null && enr.credit_rate != null && credits > 0) {
    delta = Math.round(Number(enr.credit_rate) * credits * 100) / 100
    new_list_price = Math.max(0, Math.round((Number(enr.list_price) - delta) * 100) / 100)
    await sb.from('academic_student_enrollments').update({ list_price: new_list_price }).eq('id', enr.id)
  }

  return NextResponse.json({ ok: true, delta, new_list_price, credits })
}

// ---------------------------------------------------------------------------
// DELETE { external_id, student_id, program_id } → deshace el retiro.
//
// Faltaba, y hacía falta: retirar es un clic y equivocarse de fila también. Sin
// vuelta atrás, el único arreglo era editar la base a mano.
//
// Deshacer no es volver a inscribir: la fila nunca se fue. El retiro solo le
// puso fecha —withdrawn_at— y todo el ERP la lee como "ya no está en su
// registro". Quitar esa fecha la devuelve entera, con su periodo, su aula y su
// external_id intactos. Por eso no hay riesgo de duplicar: no se crea nada.
//
// Tampoco puede chocar con una fila de plan. huecosDeRegistro mira TODAS las
// filas, retiradas incluidas, así que mientras la asignatura estuvo retirada
// nadie le creó un hueco que rellenar.
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  // Deshacer un retiro sube el precio oficial y devuelve créditos al registro:
  // es la misma decisión que retirar, del revés. Exige el permiso de edición
  // sobre Registro Curricular en vez de bastar con tener sesión, que mientras
  // el permisionador siga en modo auditoría significa cualquier colaborador.
  const noAutorizado = await guardPagina('academic_curricular')
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { external_id?: string; student_id?: string; program_id?: string } | null
  if (!b?.external_id || !b?.student_id || !b?.program_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const sb = db()
  const { data: g } = await sb.from('academic_grades')
    .select('external_id, document_number, course_id, credits, course_name, withdrawn_at, withdrawn_by, source')
    .eq('external_id', b.external_id).maybeSingle()
  if (!g) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
  if (!g.withdrawn_at) return NextResponse.json({ error: 'Esa asignatura no está retirada' }, { status: 409 })

  const { data: stu } = await sb.from('academic_students').select('document_number').eq('id', b.student_id).maybeSingle()
  if (!stu || String(stu.document_number) !== String(g.document_number)) {
    return NextResponse.json({ error: 'La inscripción no pertenece a ese estudiante' }, { status: 400 })
  }
  // Y a la malla del programa desde el que se pide: sin esto, un retiro de un
  // programa se podría deshacer desde la pantalla del otro.
  const { data: dela } = await sb.from('academic_courses')
    .select('id').eq('program_id', b.program_id).eq('id', g.course_id ?? '').maybeSingle()
  if (g.course_id && !dela) {
    return NextResponse.json({ error: 'Esa asignatura no es de este programa' }, { status: 400 })
  }

  // Mismo cuidado con el trigger que al retirar: hay que mover edited_at o el
  // update se descarta en silencio y la fila sigue retirada.
  const now = new Date().toISOString()
  const { error } = await sb.from('academic_grades')
    .update({ withdrawn_at: null, withdrawn_by: null, edited_at: now, edited_by: user.id })
    .eq('external_id', b.external_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: check } = await sb.from('academic_grades').select('withdrawn_at').eq('external_id', b.external_id).maybeSingle()
  if (check?.withdrawn_at) return NextResponse.json({ error: 'No se pudo deshacer el retiro (regla de protección). Reporta este caso.' }, { status: 409 })

  // Y devolverla al registro. La misma llamada que en el retiro: recalcula el
  // estado desde la nota, así que aquí sale de 'retirada' al que le toque —en
  // curso si no tiene nota, aprobada o reprobada si la tiene—.
  await sincronizarEstadoDeMatricula(sb, b.external_id)

  // Devolver el crédito al precio congelado, exactamente al revés que el retiro.
  // El precio que se MUESTRA se recalcula solo —tarifa × créditos del acta—;
  // esto mantiene coherente el snapshot que queda de respaldo.
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, list_price, credit_rate').eq('student_id', b.student_id).eq('program_id', b.program_id)
    .order('list_price', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  let delta = 0, new_list_price: number | null = null
  const credits = g.credits != null ? Number(g.credits) : 0
  if (enr && enr.list_price != null && enr.credit_rate != null && credits > 0) {
    delta = Math.round(Number(enr.credit_rate) * credits * 100) / 100
    new_list_price = Math.round((Number(enr.list_price) + delta) * 100) / 100
    await sb.from('academic_student_enrollments').update({ list_price: new_list_price }).eq('id', enr.id)
  }

  return NextResponse.json({ ok: true, delta, new_list_price, credits, course_name: g.course_name })
}
