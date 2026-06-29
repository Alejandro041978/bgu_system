import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { FacultyList } from '@/components/academic/faculty-list'

export const revalidate = 0

export default async function AcademicFacultyPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // 1. Faculty members
  const { data: employees } = await db
    .from('hr_employees')
    .select('id, full_name, email, position')
    .eq('is_faculty', true)
    .order('full_name')

  if (!employees?.length) {
    return (
      <>
        <Topbar title="Docentes" subtitle="Gestión académica" />
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto">
            <FacultyList faculty={[]} />
          </div>
        </div>
      </>
    )
  }

  const employeeIds = employees.map((e: { id: string }) => e.id)

  // 2. Assignments with full chain via joins
  const { data: assignments } = await db
    .from('faculty_assignments')
    .select(`
      id, hours_per_week, employee_id,
      offering:semester_offerings(
        course:academic_courses(name),
        semester:academic_semesters(
          name,
          academic_year:academic_years(name)
        )
      )
    `)
    .in('employee_id', employeeIds)

  // 3. Group assignments by employee
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignmentsByEmployee: Record<string, any[]> = {}
  for (const a of assignments ?? []) {
    if (!assignmentsByEmployee[a.employee_id]) assignmentsByEmployee[a.employee_id] = []
    const offering = a.offering
    if (!offering?.semester) continue
    assignmentsByEmployee[a.employee_id].push({
      hours_per_week: a.hours_per_week,
      course: offering.course,
      semester: offering.semester,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faculty = employees.map((e: any) => ({
    ...e,
    assignments: assignmentsByEmployee[e.id] ?? [],
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
