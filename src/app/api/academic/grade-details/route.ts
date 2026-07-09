import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?student_id= → detalle de calificaciones del estudiante (con nombre de programa)
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })

  const sb = db()
  const [{ data: details }, { data: enr }] = await Promise.all([
    sb.from('academic_grade_details')
      .select('id, enrollment_id, course_code, course_name, term_year, term_block, final_grade, retake_grade, makeup_grade, extra_points, passing_score, max_score, grades, process_grades')
      .eq('student_id', studentId)
      .order('term_year', { ascending: false }).order('term_block', { ascending: false }).order('course_name'),
    sb.from('academic_student_enrollments').select('id, academic_programs(name)').eq('student_id', studentId),
  ])

  const progByEnr = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enr ?? []) as any[]) progByEnr.set(e.id, e.academic_programs?.name ?? 'Programa')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((details ?? []) as any[]).map(d => ({
    ...d,
    program_name: d.enrollment_id ? (progByEnr.get(d.enrollment_id) ?? 'Sin programa') : 'Sin programa',
  }))

  return NextResponse.json({ details: rows })
}
