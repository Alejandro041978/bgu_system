import { createClient } from '@supabase/supabase-js'
import { KpiPeriodsManager } from '@/components/kpis/kpi-periods-manager'

export default async function KpiPeriodsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: periods }, { data: employees }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('kpi_periods').select('*').order('start_date', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('hr_employees').select('id, full_name, position, email').order('full_name'),
  ])

  return <KpiPeriodsManager periods={periods ?? []} employees={employees ?? []} />
}
