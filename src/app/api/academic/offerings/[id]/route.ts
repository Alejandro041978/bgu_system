import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateDates } from '../route'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = db()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offering } = await (supabase as any)
    .from('semester_offerings').select('semester_id').eq('id', id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: semester } = await (supabase as any)
    .from('academic_semesters').select('start_date, end_date').eq('id', offering?.semester_id).single()
  const err = validateDates(body.start_date, body.end_date, semester?.start_date, semester?.end_date)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('semester_offerings')
    .update({ start_date: body.start_date || null, end_date: body.end_date || null })
    .eq('id', id)
    .select(`
      id, created_at, start_date, end_date,
      course:academic_courses(id, name, code, credits, level, program_id,
        program:academic_programs(id, name, code)),
      assignments:faculty_assignments(id, hours_per_week, employee:hr_employees(id, full_name, position))
    `)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('semester_offerings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
