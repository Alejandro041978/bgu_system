import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?role_id= → colaboradores (hr_employees) que tienen ese rol
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const roleId = req.nextUrl.searchParams.get('role_id')
  if (!roleId) return NextResponse.json({ error: 'role_id requerido' }, { status: 400 })

  const { data, error } = await admin()
    .from('hr_employees')
    .select('id, full_name, email, position')
    .eq('role_id', roleId)
    .order('full_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ employees: data ?? [] })
}
