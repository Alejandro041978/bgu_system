import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { FacultyList } from '@/components/academic/faculty-list'

export const revalidate = 0

export default async function AcademicFacultyPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Get faculty with their assignments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('hr_employees')
    .select(`
      id, full_name, email, position,
      assignments:faculty_assignments(
        hours_per_week,
        course:academic_courses(name),
        offering:semester_offerings(
          semester:academic_semesters(
            name,
            academic_year:academic_years(name)
          )
        )
      )
    `)
    .eq('is_faculty', true)
    .order('full_name')

  // Flatten the nested offering → semester structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faculty = (data ?? []).map((f: any) => ({
    ...f,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments: (f.assignments ?? []).map((a: any) => ({
      hours_per_week: a.hours_per_week,
      course: a.course,
      semester: a.offering?.semester,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).filter((a: any) => a.semester),
  }))

  return (
    <>
      <Topbar title="Docentes" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <FacultyList faculty={faculty} />
        </div>
      </div>
    </>
  )
}
