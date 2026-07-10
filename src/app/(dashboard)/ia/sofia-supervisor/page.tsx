import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { SupervisorView } from '@/components/sofia/supervisor-view'

export const revalidate = 0

export default async function SofiaSupervisorPage() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  const [{ data: reports }, { data: bots }] = await Promise.all([
    db.from('sofia_supervisor_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(60),
    db.from('bots').select('key, name, role').eq('active', true).order('key'),
  ])

  return (
    <>
      <Topbar title="Bots · Supervisor" subtitle="IA" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <SupervisorView reports={reports ?? []} bots={bots ?? []} />
        </div>
      </div>
    </>
  )
}
