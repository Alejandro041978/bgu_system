import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Cronograma: asignaturas ya programadas en la oferta académica para un programa
// y año académico dados, opcionalmente filtrado a un solo semestre. Se arma con
// queries separadas porque Supabase no resuelve bien los joins anidados de 3+ niveles.
export async function GET(req: NextRequest) {
  const programId = req.nextUrl.searchParams.get('program_id')
  const academicYearId = req.nextUrl.searchParams.get('academic_year_id')
  const semesterId = req.nextUrl.searchParams.get('semester_id')
  if (!programId || !academicYearId) return NextResponse.json({ error: 'program_id y academic_year_id requeridos' }, { status: 400 })

  const supabase = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  let semQuery = sb.from('academic_semesters').select('id, name, start_date, end_date').eq('academic_year_id', academicYearId)
  if (semesterId) semQuery = semQuery.eq('id', semesterId)
  const { data: semesters } = await semQuery.order('start_date', { ascending: true })
  const semesterIds = (semesters ?? []).map((s: { id: string }) => s.id)
  if (!semesterIds.length) return NextResponse.json([])

  const { data: offerings } = await sb
    .from('semester_offerings')
    .select('id, start_date, end_date, semester_id, course_id')
    .in('semester_id', semesterIds)
  const courseIds = Array.from(new Set((offerings ?? []).map((o: { course_id: string }) => o.course_id)))
  if (!courseIds.length) return NextResponse.json([])

  const { data: courses } = await sb
    .from('academic_courses')
    .select('id, name, code, credits, level, program_id')
    .in('id', courseIds)
    .eq('program_id', programId)
  const coursesById = Object.fromEntries((courses ?? []).map((c: { id: string }) => [c.id, c]))

  const relevantOfferings = (offerings ?? []).filter((o: { course_id: string }) => coursesById[o.course_id])
  const offeringIds = relevantOfferings.map((o: { id: string }) => o.id)

  const { data: assignments } = offeringIds.length
    ? await sb
        .from('faculty_assignments')
        .select('id, hours_per_week, offering_id, employee:hr_employees(id, full_name, position)')
        .in('offering_id', offeringIds)
    : { data: [] }

  const assignmentsByOffering: Record<string, unknown[]> = {}
  for (const a of assignments ?? []) {
    if (!assignmentsByOffering[a.offering_id]) assignmentsByOffering[a.offering_id] = []
    assignmentsByOffering[a.offering_id].push(a)
  }

  const offeringsBySemester: Record<string, unknown[]> = {}
  for (const o of relevantOfferings) {
    if (!offeringsBySemester[o.semester_id]) offeringsBySemester[o.semester_id] = []
    offeringsBySemester[o.semester_id].push({
      id: o.id, start_date: o.start_date, end_date: o.end_date,
      course: coursesById[o.course_id],
      assignments: assignmentsByOffering[o.id] ?? [],
    })
  }

  const result = (semesters ?? [])
    .map((s: { id: string }) => ({ ...s, offerings: offeringsBySemester[s.id] ?? [] }))
    .filter((s: { offerings: unknown[] }) => s.offerings.length > 0)

  return NextResponse.json(result)
}
