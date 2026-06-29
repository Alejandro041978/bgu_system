import { createClient } from '@supabase/supabase-js'
import { KpiDashboard } from '@/components/kpis/kpi-dashboard'

export default async function KpisPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: periods } = await (supabase as any)
    .from('kpi_periods')
    .select('*')
    .order('start_date', { ascending: false })

  return <KpiDashboard periods={periods ?? []} />
}
