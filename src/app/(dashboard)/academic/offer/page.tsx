import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { OfferManager } from '@/components/academic/offer-manager'

export const revalidate = 0

export default async function AcademicOfferPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [yearsRes, facultyRes, coursesRes, contractsRes, categoriesRes] = await Promise.all([
    (supabase as any)
      .from('academic_years')
      .select('id, name, semesters:academic_semesters(id, name, status, start_date, end_date)')
      .order('start_date', { ascending: true }),
    (supabase as any)
      .from('hr_employees')
      .select('id, full_name, position')
      .eq('is_faculty', true)
      .order('full_name'),
    (supabase as any)
      .from('academic_courses')
      .select('id, name, code, credits, level, program_id, program:academic_programs(id, name, code, category_id)')
      .order('level', { nullsFirst: false }),
    (supabase as any)
      .from('hr_contracts')
      .select('employee_id, academic_year_id')
      .not('academic_year_id', 'is', null),
    (supabase as any)
      .from('academic_programs_category')
      .select('id, name')
      .order('name'),
  ])

  // Build map: academic_year_id → Set of employee_ids with contract
  const contractMap: Record<string, string[]> = {}
  for (const c of contractsRes.data ?? []) {
    if (!contractMap[c.academic_year_id]) contractMap[c.academic_year_id] = []
    if (!contractMap[c.academic_year_id].includes(c.employee_id)) {
      contractMap[c.academic_year_id].push(c.employee_id)
    }
  }

  return (
    <>
      <Topbar title="Oferta Académica" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <OfferManager
            years={yearsRes.data ?? []}
            faculty={facultyRes.data ?? []}
            allCourses={coursesRes.data ?? []}
            contractMap={contractMap}
            categories={categoriesRes.data ?? []}
          />
        </div>
      </div>
    </>
  )
}
