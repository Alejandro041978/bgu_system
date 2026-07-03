import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/settings/users/check?email=...
// GET /api/settings/users/check?email=...&reset=1  → also resets password
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Pass ?email=...' })

  // Check auth.users
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message })

  const authUser = users.find(u => u.email === email)

  // Check hr_employees
  const { data: emp } = await (supabase as any)
    .from('hr_employees')
    .select('id, full_name, email, user_id, role_id')
    .eq('email', email)
    .single()

  let resetResult = null
  if (req.nextUrl.searchParams.get('reset') === '1' && authUser) {
    const newPass = 'BGU2026!' + Math.random().toString(36).slice(2, 6).toUpperCase()
    const { error: resetErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: newPass,
      email_confirm: true,
    })
    resetResult = resetErr ? `Error: ${resetErr.message}` : `New password: ${newPass}`
  }

  return NextResponse.json({
    auth_user: authUser ? {
      id: authUser.id,
      email: authUser.email,
      confirmed: !!authUser.email_confirmed_at,
      confirmed_at: authUser.email_confirmed_at,
      created_at: authUser.created_at,
      last_sign_in: authUser.last_sign_in_at,
    } : null,
    hr_employee: emp ?? null,
    user_id_linked: emp?.user_id === authUser?.id,
    reset: resetResult,
  })
}
