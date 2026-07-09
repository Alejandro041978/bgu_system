import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { OfferManager } from '@/components/academic/offer-manager'

export const revalidate = 0

export default async function AcademicOfferPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [yearsRes, categoriesRes, groupsRes] = await Promise.all([
    (supabase as any)
      .from('academic_years')
      .select('id, name, semesters:academic_semesters(id, name, status, start_date, end_date)')
      .order('start_date', { ascending: true }),
    (supabase as any)
      .from('academic_programs_category')
      .select('id, name')
      .order('name'),
    (supabase as any)
      .from('academic_groups')
      .select('id, abbreviation, name, program_id')
      .order('name'),
  ])

  // Cursos: paginado para evitar el tope de 1000 filas de PostgREST
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCourses: any[] = []
  for (let from = 0; ; from += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('academic_courses')
      .select('id, name, code, credits, level, program_id, program:academic_programs(id, name, code, category_id)')
      .order('level', { nullsFirst: false })
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    allCourses.push(...data)
    if (data.length < 1000) break
  }

  return (
    <>
      <Topbar title="Oferta Académica" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <OfferManager
            years={yearsRes.data ?? []}
            allCourses={allCourses}
            categories={categoriesRes.data ?? []}
            groups={groupsRes.data ?? []}
          />
        </div>
      </div>
    </>
  )
}
