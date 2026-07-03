import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { CredentialsManager } from '@/components/academic/credentials-manager'

export const revalidate = 0

export default async function CredentialsPage() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  const [facultyRes, credentialsRes] = await Promise.all([
    db.from('hr_employees')
      .select('id, full_name, email, position')
      .eq('is_faculty', true)
      .order('full_name'),
    db.from('faculty_credentials').select('*'),
  ])

  const credsByEmployee: Record<string, object> = {}
  for (const c of credentialsRes.data ?? []) {
    credsByEmployee[c.employee_id] = c
  }

  const faculty = (facultyRes.data ?? []).map((e: { id: string; full_name: string; email: string; position: string | null }) => ({
    ...e,
    credential: credsByEmployee[e.id] ?? null,
  }))

  return (
    <>
      <Topbar title="Credenciales" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <CredentialsManager faculty={faculty} />
        </div>
      </div>
    </>
  )
}
