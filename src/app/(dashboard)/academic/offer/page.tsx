import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { OfferManager } from '@/components/academic/offer-manager'

export const revalidate = 0

export default async function AcademicOfferPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [yearsRes, facultyRes, coursesRes] = await Promise.all([
    (supabase as any)
      .from('academic_years')
      .select('id, name, semesters:academic_semesters(id, name, status, start_date, end_date)')
      .order('name', { ascending: false }),
    (supabase as any)
      .from('hr_employees')
      .select('id, full_name, position')
      .eq('is_faculty', true)
      .order('full_name'),
    (supabase as any)
      .from('academic_courses')
      .select('id, name, code, credits, level, program_id, program:academic_programs(id, name, code)')
      .order('level', { nullsFirst: false }),
  ])

  return (
    <>
      <Topbar title="Oferta Académica" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <OfferManager
            years={yearsRes.data ?? []}
            faculty={facultyRes.data ?? []}
            allCourses={coursesRes.data ?? []}
          />
        </div>
      </div>
    </>
  )
}
