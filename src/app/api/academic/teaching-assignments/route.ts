import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → catálogos (categorías, programas) y, con program_id, las asignaturas ofertadas
// del programa (con fechas y docentes) + docentes con sus contratos y credencial aprobada.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const programId = req.nextUrl.searchParams.get('program_id')

  const [{ data: categories }, { data: programs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let offerings: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let faculty: any[] = []
  if (programId) {
    const { data: courses } = await sb.from('academic_courses').select('id').eq('program_id', programId)
    const courseIds = (courses ?? []).map((c: { id: string }) => c.id)

    if (courseIds.length) {
      const { data: offs } = await sb.from('semester_offerings')
        .select(`id, start_date, end_date,
          course:academic_courses(name, code),
          semester:academic_semesters(name),
          assignments:faculty_assignments(id, hours_per_week, employee:hr_employees(id, full_name))`)
        .in('course_id', courseIds)
        .order('start_date', { ascending: false, nullsFirst: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      offerings = (offs ?? []).map((o: any) => ({
        id: o.id, start_date: o.start_date, end_date: o.end_date,
        course_name: o.course?.name ?? '—', course_code: o.course?.code ?? null,
        semester_name: o.semester?.name ?? '—',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assignments: (o.assignments ?? []).map((a: any) => ({ id: a.id, hours_per_week: a.hours_per_week, employee_id: a.employee?.id, employee_name: a.employee?.full_name })),
      }))
    }

    const [{ data: emps }, { data: contracts }, { data: creds }] = await Promise.all([
      sb.from('hr_employees').select('id, full_name, position').eq('is_faculty', true).order('full_name'),
      sb.from('hr_contracts').select('employee_id, start_date, end_date'),
      sb.from('faculty_credentials').select('employee_id').eq('status', 'approved'),
    ])
    const contractsBy = new Map<string, { start_date: string | null; end_date: string | null }[]>()
    for (const c of contracts ?? []) {
      const l = contractsBy.get(c.employee_id) ?? []; l.push({ start_date: c.start_date, end_date: c.end_date }); contractsBy.set(c.employee_id, l)
    }
    const approved = new Set((creds ?? []).map((c: { employee_id: string }) => c.employee_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faculty = (emps ?? []).map((f: any) => ({
      id: f.id, full_name: f.full_name, position: f.position,
      approved: approved.has(f.id), contracts: contractsBy.get(f.id) ?? [],
    }))
  }

  return NextResponse.json({ categories: categories ?? [], programs: programs ?? [], offerings, faculty })
}
