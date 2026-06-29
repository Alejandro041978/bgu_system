import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roleId = searchParams.get('role_id')
  if (!roleId) return NextResponse.json({ error: 'role_id requerido' }, { status: 400 })

  const supabase = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('role_permissions')
    .select('*')
    .eq('role_id', roleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { role_id: string; permissions: { page_key: string; can_view: boolean; can_edit: boolean }[] }
  const supabase = admin()

  // Upsert all permissions for the role
  const rows = body.permissions.map(p => ({
    role_id: body.role_id,
    page_key: p.page_key,
    can_view: p.can_view,
    can_edit: p.can_edit,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role_id,page_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
