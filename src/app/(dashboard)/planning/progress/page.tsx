import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { ProgressReporter } from '@/components/planning/progress-reporter'

export const revalidate = 0

export default async function PlanningProgressPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cyclesRes, employeesRes] = await Promise.all([
    (supabase as any).from('strategic_plan_cycles').select('*').order('start_year', { ascending: false }),
    (supabase as any).from('hr_employees').select('id, full_name, position').order('full_name'),
  ])

  return (
    <>
      <Topbar title="Reportar Avances" subtitle="Planeamiento institucional" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <ProgressReporter cycles={cyclesRes.data ?? []} employees={employeesRes.data ?? []} />
        </div>
      </div>
    </>
  )
}
