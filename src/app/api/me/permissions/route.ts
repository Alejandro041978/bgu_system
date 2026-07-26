import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function permsFor(sb: any, roleId: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: rows } = await sb
    .from('role_permissions')
    .select('page_key, can_view, can_edit')
    .eq('role_id', roleId)
  const permissions: Record<string, { can_view: boolean; can_edit: boolean }> = {}
  for (const r of rows ?? []) permissions[r.page_key] = { can_view: r.can_view, can_edit: r.can_edit }
  return permissions
}

export async function GET() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ superadmin: false, permissions: {} })

  const sb = admin() as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const { data: emp } = await sb
    .from('hr_employees')
    .select('role_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!emp?.role_id) {
    // Sin registro/rol = superadmin. Si está "viendo como rol" (cookie), devuelve
    // los permisos de ESE rol para que el sidebar y las páginas se restrinjan.
    const impRoleId = (await cookies()).get('imp_role')?.value || null
    if (impRoleId) {
      const { data: role } = await sb.from('roles').select('id, name, label').eq('id', impRoleId).maybeSingle()
      return NextResponse.json({
        superadmin: false,
        permissions: await permsFor(sb, impRoleId),
        impersonating_role: role ? { id: role.id, label: role.label || role.name } : null,
      })
    }
    return NextResponse.json({ superadmin: true, permissions: {} })
  }

  return NextResponse.json({ superadmin: false, permissions: await permsFor(sb, emp.role_id) })
}
