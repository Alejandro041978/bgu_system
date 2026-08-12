import { computeActa, creditosQueLleva } from '@/lib/acta'
import { passingByCourse, passingFor } from '@/lib/passing-score'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { sameCourse, courseNameKey } from '@/lib/course-match'
import { esFilaDePlan } from '@/lib/grade-sources'
import { etiquetaIntento } from '@/lib/grades-write'
import { guardStaff } from '@/lib/api-guard'

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
  const belongs = (g: { course_code: string | null; course_name: string | null }) =>
    malla.some(c => (c.code && g.course_code && String(c.code) === String(g.course_code)) || sameCourse(g.course_name, c.name))

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
    return {
      external_id: g.external_id,
      // El código de la malla, no el número de orden de SystemActiva.
      course_code: (g.course_id ? malla.find((c: { id: string; code: string | null }) => c.id === g.course_id)?.code : null) ?? g.course_code,
      course_name: g.course_name,
      credits: g.credits != null ? Number(g.credits) : null,
      // El recursado se distingue del primer intento en el propio registro:
      // los dos existen y el acta se queda con el mejor.
      // El periodo sale del semestre; año+bloque se contradecían en 6.747 filas.
      term: [etiquetaIntento(g.intento), g.semester_id ? (nombreSem.get(String(g.semester_id)) ?? null) : null].filter(Boolean).join(' · '),
      status: st.status, grade: st.grade, has_grade, withdrawn: !!g.withdrawn_at,
      // Solo se editan/borran notas importadas de SystemActiva (no las de Moodle)
      editable: g.source === 'systemactiva' && !g.moodle_course_id,
      final_grade: g.final_grade, retake_grade: g.retake_grade,
      kind: (esFilaDePlan(g) ? 'sin_registrar' : 'inscripcion') as 'inscripcion' | 'sin_registrar',
    }
  })

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

  // Lo que la malla tiene y el estudiante no: ni nota ni convalidación.
  const conFila = new Set([...rows, ...convRows].map(r => courseNameKey(r.course_name)))
  const faltantes = malla.filter(c => !conFila.has(courseNameKey(c.name))).map(c => ({
    external_id: `falta:${c.id}`, course_code: c.code, course_name: c.name,
    credits: c.credits != null ? Number(c.credits) : null, term: '',
    status: 'no_iniciada', grade: null, has_grade: false, withdrawn: false, editable: false,
    final_grade: null, retake_grade: null, kind: 'sin_registrar' as const,
  }))

  // Se devuelve en el orden de la malla (nivel, código); lo que no está en la
  // malla —notas sueltas de la carga histórica— va al final.
  const orden = new Map(malla.map((c, i) => [courseNameKey(c.name), i]))
  const todas = [...rows, ...convRows, ...faltantes]
    .sort((a, b) => (orden.get(courseNameKey(a.course_name)) ?? 9999) - (orden.get(courseNameKey(b.course_name)) ?? 9999)
      || String(a.course_name).localeCompare(String(b.course_name)))

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, list_price, credit_rate, credit_rate_source').eq('student_id', studentId).eq('program_id', programId)
    .order('list_price', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()

  const creditosActivos = rows.filter(r => !r.withdrawn).reduce((s, r) => s + (r.credits ?? 0), 0)

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
        creditosQueLlevaTotal = creditosQueLleva(acta)
        if (creditosQueLlevaTotal > 0) listPrice = Math.round(Number(enr.credit_rate) * creditosQueLlevaTotal * 100) / 100
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
    rows: todas,
  })
}

// PATCH { external_id, final_grade } → edita/borra la nota (final_grade null = borrar).
// SOLO notas importadas de SystemActiva (source='systemactiva', sin moodle_course_id):
// las de Moodle no se tocan aquí. Escribe edited_at para que el sync no la pise
// y actualiza ambas tablas (academic_grades + academic_grade_details) por external_id.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
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
  const noAutorizado = await guardStaff()
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
