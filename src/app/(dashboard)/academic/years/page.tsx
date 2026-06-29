import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { YearsManager } from '@/components/academic/years-manager'

export const revalidate = 0

export default async function AcademicYearsPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('academic_years')
    .select('*, semesters:academic_semesters(*)')
    .order('name', { ascending: false })

  return (
    <>
      <Topbar title="Años y Semestres" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <YearsManager initial={data ?? []} />
        </div>
      </div>
    </>
  )
}
