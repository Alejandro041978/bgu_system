import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { ProgramsManager } from '@/components/academic/programs-manager'
import { CategoriesManager } from '@/components/academic/categories-manager'

export const revalidate = 0

export default async function AcademicProgramsPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data }, { data: categories }] = await Promise.all([
    (supabase as any).from('academic_programs').select('*, courses:academic_courses(*), category:academic_programs_category(id, name)').order('name'),
    (supabase as any).from('academic_programs_category').select('id, name').order('name'),
  ])

  return (
    <>
      <Topbar title="Programas Académicos" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <CategoriesManager />
          <ProgramsManager initial={data ?? []} categories={categories ?? []} />
        </div>
      </div>
    </>
  )
}
