import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { PlanDashboard } from '@/components/planning/plan-dashboard'

export const revalidate = 0

export default async function PlanningDashboardPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cyclesRes = await (supabase as any).from('strategic_plan_cycles').select('*').order('start_year', { ascending: false })

  return (
    <>
      <Topbar title="Dashboard del Plan" subtitle="Planeamiento institucional" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <PlanDashboard cycles={cyclesRes.data ?? []} />
        </div>
      </div>
    </>
  )
}
