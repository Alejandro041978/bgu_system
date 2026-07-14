import { createClient } from '@supabase/supabase-js'
import { moodleConfigured, moodleCall } from './moodle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(build: (from: number, to: number) => any): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

const DAY = 86_400_000

function riskOf(lastMoodle: Date | null): { level: string; days: number | null } {
  if (!lastMoodle) return { level: 'never', days: null }
  const days = Math.floor((Date.now() - lastMoodle.getTime()) / DAY)
  const level = days >= 14 ? 'warn14' : days >= 7 ? 'nudge7' : 'active'
  return { level, days }
}

// Recalcula el seguimiento de todos los estudiantes matriculados.
export async function runStudentTracking(): Promise<{ ok: boolean; processed: number; moodle: string; by_risk: Record<string, number> }> {
  const sb = admin()

  // 1) Estudiantes matriculados (con al menos una matrícula)
  const enr = await readAll((f, t) => sb.from('academic_student_enrollments').select('student_id').range(f, t))
  const enrolled = new Set<string>((enr as { student_id: string }[]).map(e => e.student_id).filter(Boolean))

  // select('*') para tolerar que email_alt exista o no todavía
  const allStudents = await readAll((f, t) => sb.from('academic_students')
    .select('*').eq('disabled', false).range(f, t))
  const students = (allStudents as { id: string; email: string | null; email_alt?: string | null; phone_number: string | null }[])
    .filter(s => enrolled.has(s.id))
  const emailsOf = (s: { email: string | null; email_alt?: string | null }) =>
    [s.email, s.email_alt].map(e => e?.toLowerCase().trim()).filter((x): x is string => !!x)

  // 2) Deuda: Σ cargos − Σ pagos por estudiante
  const charges = await readAll((f, t) => sb.from('account_charges').select('student_id, amount').range(f, t))
  const payments = await readAll((f, t) => sb.from('account_payments').select('student_id, amount').range(f, t))
  const charged = new Map<string, number>()
  for (const c of charges as { student_id: string | null; amount: number }[]) if (c.student_id) charged.set(c.student_id, (charged.get(c.student_id) ?? 0) + Number(c.amount ?? 0))
  const paid = new Map<string, number>()
  for (const p of payments as { student_id: string | null; amount: number }[]) if (p.student_id) paid.set(p.student_id, (paid.get(p.student_id) ?? 0) + Number(p.amount ?? 0))

  // 3) Último ingreso al ERP: auth.users.last_sign_in_at (por correo)
  const erpLogin = new Map<string, string>()
  for (let page = 1; ; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    for (const u of users) if (u.email && u.last_sign_in_at) erpLogin.set(u.email.toLowerCase(), u.last_sign_in_at)
    if (users.length < 1000) break
  }

  // 4) Última conexión a Moodle (aula): lastaccess por CORREO (los estudiantes
  //    no tienen moodle_user_id guardado, pero sí correo). En lotes.
  const moodleAccess = new Map<string, Date>() // email (lower) → fecha
  let moodleStatus = 'no configurado'
  if (moodleConfigured()) {
    const emails = [...new Set(students.flatMap(emailsOf))]
    try {
      let matched = 0
      for (let i = 0; i < emails.length; i += 40) {
        const chunk = emails.slice(i, i + 40)
        const res = await moodleCall('core_user_get_users_by_field', { field: 'email', values: chunk })
        for (const u of (res ?? []) as { email?: string; lastaccess?: number }[]) {
          if (!u.email) continue
          matched++
          if (u.lastaccess && u.lastaccess > 0) moodleAccess.set(u.email.toLowerCase(), new Date(u.lastaccess * 1000))
        }
      }
      moodleStatus = `ok (${matched} en Moodle, ${moodleAccess.size} con acceso registrado)`
    } catch (e) {
      moodleStatus = 'error: ' + (e as Error).message
    }
  }

  // 5) Construir filas y upsert
  const now = new Date().toISOString()
  const by_risk: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = students.map(s => {
    const balance = Math.round(((charged.get(s.id) ?? 0) - (paid.get(s.id) ?? 0)) * 100) / 100
    const last_erp_login = s.email ? erpLogin.get(s.email.toLowerCase()) ?? null : null
    // Última conexión a Moodle: la más reciente entre ambos correos
    const accesses = emailsOf(s).map(e => moodleAccess.get(e)).filter((d): d is Date => !!d)
    const lastMoodle = accesses.length ? new Date(Math.max(...accesses.map(d => d.getTime()))) : null
    const { level, days } = riskOf(lastMoodle)
    by_risk[level] = (by_risk[level] ?? 0) + 1
    return {
      student_id: s.id,
      balance,
      last_erp_login,
      last_moodle_access: lastMoodle ? lastMoodle.toISOString() : null,
      inactivity_days: days,
      risk_level: level,
      updated_at: now,
    }
  })

  for (let i = 0; i < rows.length; i += 500) {
    await sb.from('student_tracking').upsert(rows.slice(i, i + 500), { onConflict: 'student_id' })
  }

  return { ok: true, processed: rows.length, moodle: moodleStatus, by_risk }
}
