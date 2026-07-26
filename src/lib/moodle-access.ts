import { setUserSuspended, resolveMoodleUserId } from './moodle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface AccessRow {
  student_id: string
  name: string
  document: string | null
  email: string | null
  external_id: string | null
  overdue: number
  has_exception: boolean
  exception_expires: string | null
  currently_suspended: boolean
  desired_suspended: boolean
  action: 'suspend' | 'unsuspend' | 'none'
}

// Vencido por estudiante: suma del saldo de cuotas con vencimiento <= hoy e impagas.
// Mismo criterio que el estado de cuenta (saldo = monto − pagos, descuentos incluidos).
export async function overdueByStudent(sb: SB): Promise<Map<string, number>> {
  const today = new Date().toISOString().slice(0, 10)
  const charges: { external_id: string; student_id: string; amount: number; due_date: string }[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('account_charges')
      .select('external_id, student_id, amount, due_date').not('due_date', 'is', null).lte('due_date', today).range(f, f + 999)
    charges.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const paid = new Map<string, number>()
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('account_payments')
      .select('charge_external_id, amount').not('charge_external_id', 'is', null).range(f, f + 999)
    for (const p of data ?? []) paid.set(p.charge_external_id, (paid.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
    if ((data ?? []).length < 1000) break
  }
  const over = new Map<string, number>()
  for (const c of charges) {
    if (!c.student_id) continue
    const bal = Number(c.amount || 0) - (paid.get(c.external_id) ?? 0)
    if (bal > 0.005) over.set(c.student_id, (over.get(c.student_id) ?? 0) + bal)
  }
  return over
}

// student_id → fin de la excepción vigente (la más lejana), si existe.
export async function activeExceptionMap(sb: SB): Promise<Map<string, string>> {
  const now = new Date().toISOString()
  const { data } = await sb.from('moodle_access_exceptions').select('student_id, expires_at').gt('expires_at', now)
  const m = new Map<string, string>()
  for (const e of data ?? []) {
    const prev = m.get(e.student_id)
    if (!prev || e.expires_at > prev) m.set(e.student_id, e.expires_at)
  }
  return m
}

// Plan de acceso: qué estudiantes deberían quedar suspendidos (vencido>0 y sin
// excepción vigente) vs. su estado actual. Incluye también a los ya suspendidos
// para detectar quién debe REACTIVARSE (pagó o recibió excepción).
export async function planAccess(sb: SB): Promise<AccessRow[]> {
  const [over, exc] = await Promise.all([overdueByStudent(sb), activeExceptionMap(sb)])
  const { data: suspended } = await sb.from('academic_students').select('id').eq('moodle_suspended', true)
  const ids = new Set<string>([...over.keys(), ...((suspended ?? []).map((s: { id: string }) => s.id))])
  if (!ids.size) return []

  const idArr = [...ids]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = new Map<string, any>()
  for (let i = 0; i < idArr.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, external_id, moodle_suspended')
      .in('id', idArr.slice(i, i + 300))
    for (const s of data ?? []) info.set(s.id, s)
  }

  const rows: AccessRow[] = []
  for (const id of idArr) {
    const s = info.get(id); if (!s) continue
    const overdue = over.get(id) ?? 0
    const hasExc = exc.has(id)
    const desired = overdue > 0.005 && !hasExc
    const cur = !!s.moodle_suspended
    const action: AccessRow['action'] = desired && !cur ? 'suspend' : (!desired && cur ? 'unsuspend' : 'none')
    rows.push({
      student_id: id, name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      document: s.document_number, email: s.email, external_id: s.external_id,
      overdue: Math.round(overdue * 100) / 100, has_exception: hasExc, exception_expires: exc.get(id) ?? null,
      currently_suspended: cur, desired_suspended: desired, action,
    })
  }
  rows.sort((a, b) => b.overdue - a.overdue)
  return rows
}

// Aplica en Moodle los cambios de suspensión y cachea el estado. Best-effort por
// estudiante: un error en uno no detiene el resto.
export async function applyAccess(sb: SB, rows: AccessRow[]): Promise<{ suspended: number; unsuspended: number; errors: string[] }> {
  const errors: string[] = []; let suspended = 0, unsuspended = 0
  for (const r of rows.filter(x => x.action !== 'none')) {
    try {
      const uid = await resolveMoodleUserId(r.external_id, r.email)
      if (!uid) { errors.push(`${r.name}: sin cuenta en Moodle`); continue }
      const suspend = r.action === 'suspend'
      await setUserSuspended(uid, suspend)
      await sb.from('academic_students').update({
        moodle_suspended: suspend, moodle_suspended_at: suspend ? new Date().toISOString() : null,
      }).eq('id', r.student_id)
      if (suspend) suspended++; else unsuspended++
    } catch (e) { errors.push(`${r.name}: ${String(e)}`) }
  }
  return { suspended, unsuspended, errors }
}

// Reactiva de inmediato la cuenta Moodle de un estudiante (al otorgar excepción o
// registrar pago). No falla si no tiene cuenta.
export async function unsuspendStudent(sb: SB, studentId: string): Promise<void> {
  const { data: s } = await sb.from('academic_students')
    .select('external_id, email, moodle_suspended').eq('id', studentId).maybeSingle()
  if (!s?.moodle_suspended) return
  const uid = await resolveMoodleUserId(s.external_id, s.email).catch(() => null)
  if (uid) await setUserSuspended(uid, false).catch(() => null)
  await sb.from('academic_students').update({ moodle_suspended: false, moodle_suspended_at: null }).eq('id', studentId)
}
