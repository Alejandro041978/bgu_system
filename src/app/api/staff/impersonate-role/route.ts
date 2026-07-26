import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isSuperadmin } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → ¿puede impersonar? (solo superadmin real), lista de roles y rol actual.
// Usa el usuario REAL (ignora la cookie para decidir can_impersonate), así la
// barra sigue visible incluso mientras se está viendo como un rol.
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isSuperadmin(user.id))) return NextResponse.json({ can_impersonate: false })

  const sb = admin()
  const { data: roles } = await sb.from('roles').select('id, name, label').order('label')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (roles ?? []).map((r: any) => ({ id: r.id, label: r.label || r.name }))
  const cur = req.cookies.get('imp_role')?.value || null
  const current = cur ? list.find((r: { id: string }) => r.id === cur) ?? null : null
  return NextResponse.json({ can_impersonate: true, roles: list, current })
}

// POST { role_id } → activa "ver como rol". { role_id: '' } → sale de la vista.
// Solo superadmin.
export async function POST(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isSuperadmin(user.id))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { role_id } = await req.json() as { role_id?: string }
  const res = NextResponse.json({ ok: true })
  if (role_id) {
    res.cookies.set('imp_role', role_id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  } else {
    res.cookies.set('imp_role', '', { httpOnly: true, path: '/', maxAge: 0 })
  }
  return res
}
