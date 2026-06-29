import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const semesterId = req.nextUrl.searchParams.get('semester_id')
  if (!semesterId) return NextResponse.json({ error: 'semester_id requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('semester_offerings')
    .select(`
      id, created_at,
      course:academic_courses(id, name, code, credits, level, program_id,
        program:academic_programs(id, name, code)),
      assignments:faculty_assignments(
        id, hours_per_week,
        employee:hr_employees(id, full_name, position)
      )
    `)
    .eq('semester_id', semesterId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('semester_offerings')
    .insert({ semester_id: body.semester_id, course_id: body.course_id })
    .select(`
      id,
      course:academic_courses(id, name, code, credits, level,
        program:academic_programs(id, name, code)),
      assignments:faculty_assignments(id, hours_per_week, employee:hr_employees(id, full_name, position))
    `)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
