import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// La identidad efectiva la resuelve createClient() (suplantación "ver como
// colaborador" incluida): si hay suplantación activa, getUser() ya devuelve al
// colaborador, así que aquí solo se leen los permisos del usuario resultante.
// Sin guard de personal a propósito: esto devuelve los permisos DEL QUE
// PREGUNTA, no los de otro. Bloquearla rompía el arranque del ERP —el
// dashboard la necesita para saber qué mostrar— y a un estudiante le responde
// una lista vacía, que es exactamente lo que le corresponde.
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
    // No employee record or no role = superadmin
    return NextResponse.json({ superadmin: true, permissions: {} })
  }

  const { data: rows } = await sb
    .from('role_permissions')
    .select('page_key, can_view, can_edit')
    .eq('role_id', emp.role_id)

  const permissions: Record<string, { can_view: boolean; can_edit: boolean }> = {}
  for (const r of rows ?? []) permissions[r.page_key] = { can_view: r.can_view, can_edit: r.can_edit }

  return NextResponse.json({ superadmin: false, permissions })
}
