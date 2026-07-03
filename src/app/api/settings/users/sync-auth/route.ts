import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// GET: diagnose — list employees without auth account
// POST: fix — create auth accounts for all employees missing one
export async function GET() {
  const db = supabase as any
  const { data: employees } = await db
    .from('hr_employees')
    .select('id, full_name, email, user_id')
    .order('full_name')

  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
  const authEmailSet = new Set(authUsers.map((u: any) => u.email))

  const missing = (employees ?? []).filter((e: any) => !e.user_id || !authEmailSet.has(e.email))
  const ok = (employees ?? []).filter((e: any) => e.user_id && authEmailSet.has(e.email))

  return NextResponse.json({
    total: employees?.length ?? 0,
    with_auth: ok.length,
    missing_auth: missing.length,
    missing_list: missing.map((e: any) => ({ id: e.id, name: e.full_name, email: e.email, has_user_id: !!e.user_id })),
  })
}

export async function POST() {
  const db = supabase as any
  const { data: employees } = await db
    .from('hr_employees')
    .select('id, full_name, email, user_id')
    .order('full_name')

  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
  const authByEmail = new Map(authUsers.map((u: any) => [u.email, u]))

  const results: { email: string; status: string; temp_password?: string }[] = []

  for (const emp of (employees ?? []) as any[]) {
    const existingAuth = authByEmail.get(emp.email)

    if (existingAuth) {
      // Auth exists but maybe not confirmed or not linked
      const tempPassword = generateTempPassword()
      await supabase.auth.admin.updateUserById(existingAuth.id, {
        password: tempPassword,
        email_confirm: true,
      })
      await db.from('hr_employees').update({ user_id: existingAuth.id }).eq('id', emp.id)
      results.push({ email: emp.email, status: 'updated', temp_password: tempPassword })
    } else {
      // No auth account at all — create one
      const tempPassword = generateTempPassword()
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: emp.email,
        password: tempPassword,
        user_metadata: { full_name: emp.full_name },
        email_confirm: true,
      })
      if (error) {
        results.push({ email: emp.email, status: `error: ${error.message}` })
        continue
      }
      const authId = created.user?.id
      if (authId) {
        await supabase.auth.admin.updateUserById(authId, { email_confirm: true })
        await db.from('hr_employees').update({ user_id: authId }).eq('id', emp.id)
      }
      results.push({ email: emp.email, status: 'created', temp_password: tempPassword })
    }
  }

  return NextResponse.json({ ok: true, results })
}
