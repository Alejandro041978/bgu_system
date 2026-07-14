import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { FacultyList } from '@/components/academic/faculty-list'

export const revalidate = 0

export default async function AcademicFacultyPage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [employeesRes, yearsRes] = await Promise.all([
    db.from('hr_employees').select('id, full_name, first_names, last_names, email, position').eq('is_faculty', true).order('full_name'),
    db.from('academic_years').select('id, name, start_date, end_date').order('start_date', { ascending: true }),
  ])

  const employees = employeesRes.data ?? []
  const academicYears = yearsRes.data ?? []

  if (!employees.length) {
    return (
      <>
        <Topbar title="Docentes" subtitle="Gestión académica" />
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto">
            <FacultyList faculty={[]} academicYears={[]} contractsByFaculty={{}} />
          </div>
        </div>
      </>
    )
  }

  const employeeIds = employees.map((e: { id: string }) => e.id)

  const [assignmentsRes, contractsRes] = await Promise.all([
    db.from('faculty_assignments').select(`
      id, hours_per_week, employee_id,
      offering:semester_offerings(
        course:academic_courses(name),
        semester:academic_semesters(
          name,
          academic_year:academic_years(name)
        )
      )
    `).in('employee_id', employeeIds),
    db.from('hr_contracts').select('employee_id, academic_year_id')
      .in('employee_id', employeeIds)
      .not('academic_year_id', 'is', null),
  ])

  // contracts indexed: employee_id → array of academic_year_ids with contract
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractsByFaculty: Record<string, string[]> = {}
  for (const c of contractsRes.data ?? []) {
    if (!contractsByFaculty[c.employee_id]) contractsByFaculty[c.employee_id] = []
    if (!contractsByFaculty[c.employee_id].includes(c.academic_year_id)) {
      contractsByFaculty[c.employee_id].push(c.academic_year_id)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignmentsByEmployee: Record<string, any[]> = {}
  for (const a of assignmentsRes.data ?? []) {
    if (!assignmentsByEmployee[a.employee_id]) assignmentsByEmployee[a.employee_id] = []
    const offering = a.offering
    if (!offering?.semester) continue
    assignmentsByEmployee[a.employee_id].push({
      hours_per_week: a.hours_per_week,
      course: offering.course,
      semester: offering.semester,
    })
  }

  // Ordenar por apellido: usa last_names si existe; si no, deriva del nombre
  // completo (últimas 2 palabras = apellidos).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apellidoKey = (e: any) => {
    if (e.last_names?.trim()) return e.last_names.trim()
    const t = (e.full_name ?? '').trim().split(/\s+/)
    return t.length >= 2 ? t.slice(-2).join(' ') : (t[0] ?? '')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faculty = employees.map((e: any) => ({
    ...e,
    assignments: assignmentsByEmployee[e.id] ?? [],
  }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => apellidoKey(a).localeCompare(apellidoKey(b), 'es', { sensitivity: 'base' }))

  return (
    <>
      <Topbar title="Docentes" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <FacultyList
            faculty={faculty}
            academicYears={academicYears}
            contractsByFaculty={contractsByFaculty}
          />
        </div>
      </div>
    </>
  )
}
