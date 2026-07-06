import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { TransferSchemesView } from '@/components/academic/transfer-schemes-view'

export const revalidate = 0

export default async function TransferSchemesPage() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sb as any

  const [programsRes, scalesRes] = await Promise.all([
    s.from('academic_programs').select('id, name, code, courses:academic_courses(id, name, code)').order('name'),
    s.from('grade_scales').select('*').eq('active', true).order('name'),
  ])

  return (
    <>
      <Topbar title="Esquemas masivos" subtitle="Convalidaciones por convenio" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <TransferSchemesView programs={programsRes.data ?? []} scales={scalesRes.data ?? []} />
        </div>
      </div>
    </>
  )
}
