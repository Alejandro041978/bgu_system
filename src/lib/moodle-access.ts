import { setUserSuspended, resolveMoodleUserId, moodleConfigured, findMoodleUsersByName } from './moodle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface AccessRow {
  student_id: string
  name: string
  document: string | null
  email: string | null
  email_alt: string | null
  external_id: string | null
  moodle_user_id: number | null
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
      .select('id, first_name, last_name, second_last_name, document_number, email, email_alt, external_id, moodle_user_id, moodle_suspended')
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
      document: s.document_number, email: s.email, email_alt: s.email_alt ?? null,
      external_id: s.external_id, moodle_user_id: s.moodle_user_id ?? null,
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
      const uid = r.moodle_user_id ?? await resolveMoodleUserId(r.external_id, r.email_alt, r.email)
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
    .select('external_id, email, email_alt, moodle_user_id, moodle_suspended').eq('id', studentId).maybeSingle()
  if (!s?.moodle_suspended) return
  const uid = s.moodle_user_id ?? await resolveMoodleUserId(s.external_id, s.email_alt, s.email).catch(() => null)
  if (uid) await setUserSuspended(uid, false).catch(() => null)
  await sb.from('academic_students').update({ moodle_suspended: false, moodle_suspended_at: null }).eq('id', studentId)
}

// Vencido de UN estudiante (consulta ligera, para reconciliar tras un pago).
export async function overdueForStudent(sb: SB, studentId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: charges } = await sb.from('account_charges')
    .select('external_id, amount, due_date').eq('student_id', studentId).not('due_date', 'is', null).lte('due_date', today)
  if (!charges?.length) return 0
  const extIds = charges.map((c: { external_id: string }) => c.external_id)
  const paid = new Map<string, number>()
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await sb.from('account_payments').select('charge_external_id, amount').in('charge_external_id', extIds.slice(i, i + 300))
    for (const p of data ?? []) paid.set(p.charge_external_id, (paid.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
  }
  let over = 0
  for (const c of charges) { const bal = Number(c.amount || 0) - (paid.get(c.external_id) ?? 0); if (bal > 0.005) over += bal }
  return Math.round(over * 100) / 100
}

// Reconcilia el acceso de UN estudiante (suspende/reactiva según su vencido y
// excepción vigente). Idempotente: no llama a Moodle si el estado ya es el correcto.
export async function refreshStudentAccess(sb: SB, studentId: string): Promise<void> {
  if (!moodleConfigured()) return
  const { data: s } = await sb.from('academic_students')
    .select('external_id, email, email_alt, moodle_user_id, moodle_suspended').eq('id', studentId).maybeSingle()
  if (!s) return
  const now = new Date().toISOString()
  const { data: exc } = await sb.from('moodle_access_exceptions').select('id').eq('student_id', studentId).gt('expires_at', now).limit(1)
  const hasExc = (exc?.length ?? 0) > 0
  const overdue = hasExc ? 0 : await overdueForStudent(sb, studentId)
  const desired = overdue > 0.005 && !hasExc
  if (desired === !!s.moodle_suspended) return
  const uid = s.moodle_user_id ?? await resolveMoodleUserId(s.external_id, s.email_alt, s.email).catch(() => null)
  if (uid) await setUserSuspended(uid, desired).catch(() => null)
  await sb.from('academic_students').update({ moodle_suspended: desired, moodle_suspended_at: desired ? now : null }).eq('id', studentId)
}

export interface LinkResult {
  student_id: string; name: string; email: string | null
  status: 'vinculado' | 'candidato' | 'ambiguo' | 'sin_cuenta'
  moodle_user_id?: number | null; moodle_email?: string | null; matches?: number
}

// Diagnóstico de vinculación: para los estudiantes en deuda AÚN sin suspender y
// sin moodle_user_id cacheado, intenta localizar su cuenta Moodle.
//  - Llave fiable (idnumber/institucional/personal) → cachea moodle_user_id (vinculado).
//  - Búsqueda por nombre → candidato (1 match) / ambiguo (varios), para revisar a mano.
//  - Nada → sin_cuenta.
export async function diagnoseLinks(sb: SB): Promise<{ rows: LinkResult[]; name_search: boolean }> {
  const over = await overdueByStudent(sb)
  const ids = [...over.keys()]
  if (!ids.length) return { rows: [], name_search: true }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, email, email_alt, external_id, moodle_user_id, moodle_suspended')
      .in('id', ids.slice(i, i + 300))
    for (const s of data ?? []) info.set(s.id, s)
  }
  const targets = ids.map(id => info.get(id)).filter(s => s && !s.moodle_user_id && !s.moodle_suspended)

  const rows: LinkResult[] = []
  let nameSearch = true
  for (const s of targets) {
    const name = [s.first_name, s.last_name].filter(Boolean).join(' ')
    const uid = await resolveMoodleUserId(s.external_id, s.email_alt, s.email).catch(() => null)
    if (uid) {
      await sb.from('academic_students').update({ moodle_user_id: uid }).eq('id', s.id)
      rows.push({ student_id: s.id, name, email: s.email, status: 'vinculado', moodle_user_id: uid })
      continue
    }
    if (nameSearch && s.first_name && s.last_name) {
      const found = await findMoodleUsersByName(s.first_name, s.last_name)
      if (found === null) { nameSearch = false }
      else if (found.length === 1) { rows.push({ student_id: s.id, name, email: s.email, status: 'candidato', moodle_user_id: found[0].id, moodle_email: found[0].email }); continue }
      else if (found.length > 1) { rows.push({ student_id: s.id, name, email: s.email, status: 'ambiguo', matches: found.length }); continue }
    }
    rows.push({ student_id: s.id, name, email: s.email, status: 'sin_cuenta' })
  }
  return { rows, name_search: nameSearch }
}

// Confirma un candidato: cachea el moodle_user_id elegido a mano.
export async function linkStudent(sb: SB, studentId: string, moodleUserId: number): Promise<void> {
  await sb.from('academic_students').update({ moodle_user_id: moodleUserId }).eq('id', studentId)
}

// Tras registrar pagos: reactiva a los estudiantes que estaban SUSPENDIDOS y ya
// quedaron sin vencido. Solo mira a los suspendidos → mínimas llamadas a Moodle.
export async function refreshAccessForStudents(sb: SB, studentIds: string[]): Promise<number> {
  if (!moodleConfigured() || !studentIds.length) return 0
  const uniq = [...new Set(studentIds.filter(Boolean))]
  let done = 0
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await sb.from('academic_students').select('id').in('id', uniq.slice(i, i + 300)).eq('moodle_suspended', true)
    for (const s of data ?? []) { try { await refreshStudentAccess(sb, s.id); done++ } catch { /* best-effort */ } }
  }
  return done
}
