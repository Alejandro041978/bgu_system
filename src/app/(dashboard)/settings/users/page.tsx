import { createClient } from '@supabase/supabase-js'
import { UsersManager } from '@/components/settings/users-manager'

export default async function UsersPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: employees }, { data: roles }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('hr_employees')
      .select('id, full_name, email, position, employee_type, role_id, role:roles(id, label)')
      .order('full_name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('roles').select('*').order('label'),
  ])

  return <UsersManager employees={employees ?? []} roles={roles ?? []} />
}
