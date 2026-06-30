import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { StrategicPlanManager } from '@/components/planning/strategic-plan-manager'

export const revalidate = 0

export default async function StrategicPlanPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cyclesRes, facultyRes] = await Promise.all([
    (supabase as any).from('strategic_plan_cycles').select('*').order('start_year', { ascending: false }),
    (supabase as any).from('hr_employees').select('id, full_name, position').order('full_name'),
  ])

  return (
    <>
      <Topbar title="Plan Estratégico" subtitle="Planeamiento institucional" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <StrategicPlanManager cycles={cyclesRes.data ?? []} faculty={facultyRes.data ?? []} />
        </div>
      </div>
    </>
  )
}
