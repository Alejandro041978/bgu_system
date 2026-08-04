import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isSuperadmin } from '@/lib/student-identity'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → ¿puede suplantar? (solo superadmin REAL), lista de colaboradores y quién
// se está suplantando ahora. Usa el usuario real (impersonate:false) para que la
// barra siga visible —y el "salir" disponible— aun estando dentro de la vista.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const authClient = await createAuthClient({ impersonate: false })
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isSuperadmin(user.id))) return NextResponse.json({ can_impersonate: false })

  const sb = admin()
  const { data: emps } = await sb.from('hr_employees')
    .select('user_id, full_name, position, role_id').not('user_id', 'is', null).order('full_name')
  const roleIds = [...new Set((emps ?? []).map((e: { role_id: string | null }) => e.role_id).filter(Boolean))]
  const roleMap = new Map<string, string>()
  if (roleIds.length) {
    const { data: roles } = await sb.from('roles').select('id, name, label').in('id', roleIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (roles ?? []) as any[]) roleMap.set(r.id, r.label || r.name)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staff = (emps ?? []).map((e: any) => ({
    user_id: e.user_id, name: e.full_name, position: e.position,
    role: e.role_id ? (roleMap.get(e.role_id) ?? null) : null,
  })).filter((s: { user_id: string }) => s.user_id !== user.id) // no suplantarse a sí mismo

  const cur = req.cookies.get('imp_user')?.value || null
  const current = cur ? staff.find((s: { user_id: string }) => s.user_id === cur) ?? null : null
  return NextResponse.json({ can_impersonate: true, staff, current })
}

// POST { user_id } → activa "ver como colaborador". { user_id: '' } → sale.
// Solo superadmin real.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const authClient = await createAuthClient({ impersonate: false })
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isSuperadmin(user.id))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { user_id } = await req.json() as { user_id?: string }
  const res = NextResponse.json({ ok: true })
  if (user_id) {
    res.cookies.set('imp_user', user_id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  } else {
    res.cookies.set('imp_user', '', { httpOnly: true, path: '/', maxAge: 0 })
  }
  return res
}
