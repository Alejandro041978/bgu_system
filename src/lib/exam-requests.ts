import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Exámenes solicitables (regla del usuario 2026-07-22). Subsanación:
// elegible = asignatura DESAPROBADA en el promedio final cuya suma de
// PONDERACIONES rendidas (evaluaciones con nota en el Acta Detallada,
// process_grades: [{n, pct, val, desc}]) alcanza al menos el 70%.
// ---------------------------------------------------------------------------

export interface EligibleCourse {
  grade_external_id: string
  course_code: string | null
  course_name: string | null
  final: number
  passing: number
  pct_rendida: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function eligibleCourses(sb: any, studentId: string, documentNumber: string | null): Promise<EligibleCourse[]> {
  if (!documentNumber) return []

  const { data: grades } = await sb.from('academic_grades')
    .select('external_id, course_code, course_name, final_grade, retake_grade, passing_score, source')
    .eq('document_number', documentNumber)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((grades ?? []) as any[]).filter(g => g.source !== 'convalidacion' && g.source !== 'validacion')

  // Detalle de evaluaciones (ponderaciones) por asignatura
  const { data: details } = await sb.from('academic_grade_details')
    .select('course_code, course_name, process_grades').eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailByCode = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (details ?? []) as any[]) {
    if (d.course_code) detailByCode.set(String(d.course_code), d)
  }

  // Solicitudes activas (no duplicar)
  const { data: reqs } = await sb.from('exam_requests')
    .select('grade_external_id, status').eq('student_id', studentId)
    .in('status', ['pendiente_pago', 'pendiente_evaluacion'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activas = new Set(((reqs ?? []) as any[]).map(r => r.grade_external_id))

  const out: EligibleCourse[] = []
  for (const g of rows) {
    if (activas.has(g.external_id)) continue
    const passing = g.passing_score != null ? Number(g.passing_score) : null
    if (passing == null) continue
    const values = [g.final_grade, g.retake_grade].filter((v: number | null): v is number => v != null)
    if (!values.length) continue
    const best = Math.max(...values)
    if (best >= passing) continue                 // aprobada: no aplica

    const det = g.course_code ? detailByCode.get(String(g.course_code)) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evals = Array.isArray(det?.process_grades) ? det.process_grades as any[] : []
    if (!evals.length) continue
    const pctRendida = evals.reduce((s, e) => s + (e?.val != null ? Number(e?.pct ?? 0) : 0), 0)
    if (pctRendida < 70) continue

    out.push({
      grade_external_id: g.external_id,
      course_code: g.course_code ?? null,
      course_name: g.course_name ?? null,
      final: best,
      passing,
      pct_rendida: Math.round(pctRendida * 10) / 10,
    })
  }
  return out.sort((a, b) => (a.course_name ?? '').localeCompare(b.course_name ?? ''))
}

export async function createExamRequest(
  studentId: string, documentNumber: string | null, examTypeId: string, gradeExternalId: string,
): Promise<{ ok: boolean; error?: string; charge?: number }> {
  const sb = admin()
  const { data: type } = await sb.from('exam_types').select('*').eq('id', examTypeId).eq('active', true).maybeSingle()
  if (!type) return { ok: false, error: 'Tipo de examen no disponible' }

  // Revalidar elegibilidad en el servidor (la UI puede estar desfasada)
  const eleg = await eligibleCourses(sb, studentId, documentNumber)
  const course = eleg.find(e => e.grade_external_id === gradeExternalId)
  if (!course) return { ok: false, error: 'La asignatura no cumple los requisitos para este examen (o ya tiene una solicitud activa)' }

  // Cargo al estado de cuenta, colgado de la matrícula cuyo programa contiene
  // la asignatura (para que no caiga en "Sin programa")
  let enrollmentId: string | null = null
  let convocatoriaId: string | null = null
  if (course.course_code) {
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('id, program_id, convocatoria_id').eq('student_id', studentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (enr ?? []) as any[]) {
      const { count } = await sb.from('academic_courses')
        .select('id', { count: 'exact', head: true }).eq('program_id', e.program_id).eq('code', course.course_code)
      if ((count ?? 0) > 0) { enrollmentId = e.id; convocatoriaId = e.convocatoria_id ?? null; break }
    }
  }

  const chargeExternalId = crypto.randomUUID()
  const { error: chErr } = await sb.from('account_charges').insert({
    external_id: chargeExternalId,
    student_id: studentId,
    enrollment_id: enrollmentId,
    convocatoria_id: convocatoriaId,
    amount: Number(type.price),
    due_date: new Date().toISOString().slice(0, 10),
    charge_type: type.charge_concept ?? null,
    source: 'erp',
    is_initial: false,
  })
  if (chErr) return { ok: false, error: 'No se pudo crear el cargo: ' + chErr.message }

  const { error } = await sb.from('exam_requests').insert({
    student_id: studentId,
    exam_type_id: examTypeId,
    grade_external_id: gradeExternalId,
    course_code: course.course_code,
    course_name: course.course_name,
    status: 'pendiente_pago',
    charge_external_id: chargeExternalId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, charge: Number(type.price) }
}

// Gatillo de pago: si la cuota pagada pertenece a una solicitud de examen
// pendiente y quedó saldada, pasa a la Hoja de Control.
export async function maybeMarkExamPaid(chargeExternalId: string): Promise<boolean> {
  const sb = admin()
  const { data: req } = await sb.from('exam_requests')
    .select('id, charge_external_id').eq('charge_external_id', chargeExternalId)
    .eq('status', 'pendiente_pago').maybeSingle()
  if (!req) return false
  const { data: charge } = await sb.from('account_charges')
    .select('amount').eq('external_id', chargeExternalId).maybeSingle()
  const { data: pays } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', chargeExternalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagado = ((pays ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  if (pagado < Number(charge?.amount ?? 0) - 0.01) return false
  await sb.from('exam_requests')
    .update({ status: 'pendiente_evaluacion', paid_at: new Date().toISOString() }).eq('id', req.id)
  return true
}
