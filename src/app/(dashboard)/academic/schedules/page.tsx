import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { SchedulesView } from '@/components/academic/schedules-view'

export const revalidate = 0

export default async function AcademicSchedulesPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [programsRes, yearsRes] = await Promise.all([
    (supabase as any).from('academic_programs').select('id, name, code').order('name'),
    (supabase as any).from('academic_years').select('id, name, semesters:academic_semesters(id, name)').order('name', { ascending: false }),
  ])

  return (
    <>
      <Topbar title="Cronogramas" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <SchedulesView programs={programsRes.data ?? []} years={yearsRes.data ?? []} />
        </div>
      </div>
    </>
  )
}
