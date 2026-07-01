import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { EffectivenessDashboard } from '@/components/planning/effectiveness-dashboard'

export const revalidate = 0

export default async function EffectivenessDashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

  const { data: plans } = await sb
    .from('effectiveness_plans')
    .select('id, name, year')
    .order('year', { ascending: false })

  return (
    <>
      <Topbar title="Dashboard · Plan de Efectividad" subtitle="KPIs con porcentaje de éxito" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <EffectivenessDashboard plans={plans ?? []} />
        </div>
      </div>
    </>
  )
}
