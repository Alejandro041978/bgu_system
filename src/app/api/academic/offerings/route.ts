import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const SELECT = `
  id, created_at, start_date, end_date, group_label, group_id, semester_id,
  group:academic_groups(id, abbreviation, name),
  course:academic_courses(id, name, code, credits, level, program_id,
    program:academic_programs(id, name, code, category_id)),
  assignments:faculty_assignments(
    id, hours_per_week,
    employee:hr_employees(id, full_name, position)
  )
`

export async function GET(req: NextRequest) {
  const semesterId = req.nextUrl.searchParams.get('semester_id')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db() as any).from('semester_offerings').select(SELECT).order('created_at')
  if (semesterId) q = q.eq('semester_id', semesterId)  // opcional: un solo semestre

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = db()

  if (body.start_date || body.end_date) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: semester } = await (supabase as any)
      .from('academic_semesters').select('start_date, end_date').eq('id', body.semester_id).single()
    const err = validateDates(body.start_date, body.end_date, semester?.start_date, semester?.end_date)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('semester_offerings')
    .insert({ semester_id: body.semester_id, course_id: body.course_id, start_date: body.start_date || null, end_date: body.end_date || null, group_id: body.group_id || null })
    .select(SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export function validateDates(start: string | null | undefined, end: string | null | undefined, semStart: string | null | undefined, semEnd: string | null | undefined): string | null {
  if (start && end && start > end) return 'La fecha de inicio debe ser anterior a la fecha de término'
  if (semStart && start && start < semStart) return `La fecha de inicio no puede ser anterior al inicio del semestre (${semStart})`
  if (semEnd && end && end > semEnd) return `La fecha de término no puede ser posterior al fin del semestre (${semEnd})`
  if (semEnd && start && start > semEnd) return `La fecha de inicio no puede ser posterior al fin del semestre (${semEnd})`
  if (semStart && end && end < semStart) return `La fecha de término no puede ser anterior al inicio del semestre (${semStart})`
  return null
}
