import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { placeStudentInEntry } from './carousel'
import { createStudentEmail, notifyStudentEmail, googleConfigured, langFor } from './google-workspace'
import { sameCourse } from './course-match'

// UUID determinístico (formato v4) a partir de una semilla: mismo insumo →
// mismo id → el registro de malla es idempotente aunque se re-ejecute.
// (academic_grades.external_id es de tipo uuid.)
function stableUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Activación de matrícula (flujo nativo, regla del usuario 2026-07-21):
// la matrícula nace 'pendiente_pago' con su estado de cuenta; al PAGARSE los
// conceptos iniciales (o por decisión manual) se ACTIVA:
//   1. registro de la MALLA COMPLETA del programa en el acta (filas sin nota)
//   2. correo institucional (solo Bachelor/Master/Doctorado)
//   3. colocación en el carrusel de entrada → cuenta Moodle + aulas
// Idempotente: re-activar completa lo que falte sin duplicar nada.
// ---------------------------------------------------------------------------

export interface ActivationResult {
  ok: boolean
  status: string
  acta_registradas: number
  correo: { ok: boolean; email?: string; note?: string }
  colocacion: { ok: boolean; note: string }
  errors: string[]
}

// ¿Los conceptos iniciales de la matrícula están pagados?
// (sin conceptos iniciales no hay puerta: se considera satisfecho)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initialsPaid(sb: any, enrollmentId: string): Promise<{ paid: boolean; pendientes: number }> {
  const { data: charges } = await sb.from('account_charges')
    .select('external_id, amount').eq('enrollment_id', enrollmentId).eq('is_initial', true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (charges ?? []) as any[]
  if (!list.length) return { paid: true, pendientes: 0 }
  const { data: pays } = await sb.from('account_payments')
    .select('charge_external_id, amount').in('charge_external_id', list.map(c => c.external_id))
  const paidByCharge = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (pays ?? []) as any[]) {
    paidByCharge.set(p.charge_external_id, (paidByCharge.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
  }
  const pendientes = list.filter(c => (paidByCharge.get(c.external_id) ?? 0) < Number(c.amount) - 0.01).length
  return { paid: pendientes === 0, pendientes }
}

// Registra la malla completa del programa en el acta: filas sin nota (source
// 'registro'), saltando asignaturas que ya tienen fila (histórico, convalidada
// o registro previo). external_id determinístico = idempotente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function registerCurriculum(sb: any, enr: any, stu: any): Promise<number> {
  const { data: courses } = await sb.from('academic_courses')
    .select('id, code, name, credits').eq('program_id', enr.program_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const malla = (courses ?? []) as any[]
  if (!malla.length) return 0

  const doc = String(stu.document_number ?? '')
  if (!doc) return 0
  const { data: existing } = await sb.from('academic_grades')
    .select('course_code, course_name').eq('document_number', doc)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const have = (existing ?? []) as any[]
  const hasCourse = (c: { code: string | null; name: string | null }) => have.some(g =>
    (c.code && g.course_code && String(g.course_code) === String(c.code)) || sameCourse(g.course_name, c.name))

  const name = [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ')
  const rows = malla.filter(c => !hasCourse(c)).map(c => ({
    external_id: stableUuid(`registro|${enr.id}|${c.id}`),
    document_number: doc,
    email: stu.email ?? null,
    student_name: name,
    course_code: c.code ?? null,
    course_name: c.name ?? null,
    credits: c.credits ?? null,
    final_grade: null,
    source: 'registro',
  }))
  if (!rows.length) return 0
  const { error } = await sb.from('academic_grades').upsert(rows, { onConflict: 'external_id' })
  if (error) throw new Error(`acta: ${error.message}`)
  return rows.length
}

// Correo institucional (mismas reglas del hook de matrícula: solo B/M/D, no bloqueante)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureStudentEmail(sb: any, enr: any, stu: any, categoryName: string): Promise<ActivationResult['correo']> {
  if (!/bachelor|master|doctor/i.test(categoryName)) {
    return { ok: false, note: `la categoría "${categoryName || 'sin categoría'}" no tiene derecho a correo estudiantil` }
  }
  if (stu.email_alt) return { ok: true, email: stu.email_alt, note: 'ya tenía correo institucional' }
  if (!googleConfigured()) return { ok: false, note: 'Google Workspace sin configurar (crear desde la Ficha)' }
  const taken = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students')
      .select('email_alt').not('email_alt', 'is', null).range(from, from + 999)
    for (const r of (data ?? [])) taken.add(String(r.email_alt).toLowerCase())
    if ((data ?? []).length < 1000) break
  }
  const created = await createStudentEmail(stu, taken, { email: stu.email, phone: stu.phone_number })
  await sb.from('academic_students').update({ email_alt: created.email }).eq('id', stu.id)
  let notified = false
  if (stu.email) {
    try {
      await notifyStudentEmail(stu.email, [stu.first_name, stu.last_name].filter(Boolean).join(' '), created, langFor(stu.country))
      notified = true
    } catch { /* aviso en note */ }
  }
  return { ok: true, email: created.email, note: notified ? 'notificado' : 'creado (sin notificar)' }
}

export async function activateEnrollment(enrollmentId: string, activatedBy: string): Promise<ActivationResult> {
  const sb = admin()
  const result: ActivationResult = {
    ok: false, status: '', acta_registradas: 0,
    correo: { ok: false, note: 'sin intentar' },
    colocacion: { ok: false, note: 'sin intentar' },
    errors: [],
  }

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, status, academic_programs(name, category:academic_programs_category(name))')
    .eq('id', enrollmentId).maybeSingle()
  if (!enr) { result.errors.push('Matrícula no encontrada'); return result }
  const { data: stu } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, email, email_alt, country, phone_number')
    .eq('id', enr.student_id).maybeSingle()
  if (!stu) { result.errors.push('Estudiante no encontrado'); return result }

  // 1. Malla completa en el acta
  try { result.acta_registradas = await registerCurriculum(sb, enr, stu) }
  catch (e) { result.errors.push(e instanceof Error ? e.message : String(e)) }

  // 2. Correo institucional (no bloqueante)
  try { result.correo = await ensureStudentEmail(sb, enr, stu, enr.academic_programs?.category?.name ?? '') }
  catch (e) { result.correo = { ok: false, note: e instanceof Error ? e.message : String(e) } }

  // 3. Carrusel + Moodle (colocación de entrada única; con varias, bandeja)
  try {
    const placement = await placeStudentInEntry(sb, enr.student_id, enr.program_id)
    result.colocacion = { ok: placement.ok, note: placement.note }
  } catch (e) { result.colocacion = { ok: false, note: e instanceof Error ? e.message : String(e) } }

  // 4. Marcar activa (aunque queden pasos con aviso: son re-ejecutables)
  const { error: updErr } = await sb.from('academic_student_enrollments')
    .update({ status: 'activa', activated_at: new Date().toISOString(), activated_by: activatedBy })
    .eq('id', enrollmentId)
  if (updErr) result.errors.push(updErr.message)

  result.status = 'activa'
  result.ok = result.errors.length === 0
  return result
}

// Gatillo automático: tras enlazar un pago a una cuota, si la cuota es inicial
// y su matrícula está pendiente con los iniciales ya saldados → activa.
export async function maybeActivateOnPayment(chargeExternalId: string): Promise<ActivationResult | null> {
  const sb = admin()
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, enrollment_id, is_initial').eq('external_id', chargeExternalId).maybeSingle()
  if (!charge?.is_initial || !charge.enrollment_id) return null
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, status').eq('id', charge.enrollment_id).maybeSingle()
  if (!enr || enr.status !== 'pendiente_pago') return null
  const { paid } = await initialsPaid(sb, enr.id)
  if (!paid) return null
  return activateEnrollment(enr.id, 'auto:pago')
}
