import { createClient } from '@supabase/supabase-js'
import { SchedulesView } from '@/components/academic/schedules-view'

export const revalidate = 0

export default async function StudentHomePage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [programsRes, yearsRes, categoriesRes] = await Promise.all([
    (supabase as any).from('academic_programs').select('id, name, code, category_id').order('name'),
    (supabase as any).from('academic_years').select('id, name, semesters:academic_semesters(id, name)').order('name', { ascending: false }),
    (supabase as any).from('academic_programs_category').select('id, name').order('name'),
  ])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Cronogramas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Consulta los cronogramas académicos</p>
      </div>
      <SchedulesView programs={programsRes.data ?? []} years={yearsRes.data ?? []} categories={categoriesRes.data ?? []} />
    </div>
  )
}
