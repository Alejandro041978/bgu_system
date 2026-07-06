import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { TransferCreditsView } from '@/components/academic/transfer-credits-view'

export const revalidate = 0

export default async function TransferCreditsPage() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sb as any

  const [programsRes, scalesRes, categoriesRes] = await Promise.all([
    s.from('academic_programs').select('id, name, code, category_id, courses:academic_courses(id, name, code, credits)').order('name'),
    s.from('grade_scales').select('*').eq('active', true).order('name'),
    s.from('academic_programs_category').select('id, name, passing_score').order('name'),
  ])

  return (
    <>
      <Topbar title="Convalidaciones" subtitle="Transfer credit" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <TransferCreditsView
            programs={programsRes.data ?? []}
            scales={scalesRes.data ?? []}
            categories={categoriesRes.data ?? []}
          />
        </div>
      </div>
    </>
  )
}
