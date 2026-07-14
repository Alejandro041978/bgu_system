import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { runStudentTracking } from '@/lib/student-tracking'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?risk= → filas de seguimiento + resumen por nivel
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const risk = req.nextUrl.searchParams.get('risk')

  let q = sb.from('student_tracking')
    .select('student_id, balance, last_erp_login, last_moodle_access, inactivity_days, risk_level, updated_at, student:academic_students(first_name, last_name, second_last_name, phone_number, email, document_number)')
    .order('inactivity_days', { ascending: false, nullsFirst: true })
  if (risk) q = q.eq('risk_level', risk)
  const { data } = await q.limit(2000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    student_id: r.student_id, balance: r.balance, last_erp_login: r.last_erp_login,
    last_moodle_access: r.last_moodle_access, inactivity_days: r.inactivity_days, risk_level: r.risk_level,
    updated_at: r.updated_at,
    name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    phone: r.student?.phone_number ?? null, email: r.student?.email ?? null, document_number: r.student?.document_number ?? null,
  }))

  // Resumen por nivel (sin filtro)
  const { data: all } = await sb.from('student_tracking').select('risk_level')
  const counts: Record<string, number> = {}
  for (const r of all ?? []) counts[r.risk_level] = (counts[r.risk_level] ?? 0) + 1

  const { data: last } = await sb.from('student_tracking').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({ rows, counts, last_updated: last?.updated_at ?? null })
}

// POST → recalcula ahora (usuario autenticado)
export async function POST() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const r = await runStudentTracking()
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
