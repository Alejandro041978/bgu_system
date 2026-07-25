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
  const [{ data: details }, { data: enr }, { data: stu }] = await Promise.all([
    sb.from('academic_grade_details')
      .select('id, external_id, enrollment_id, course_code, course_name, term_year, term_block, final_grade, retake_grade, makeup_grade, extra_points, passing_score, max_score, grades, process_grades')
      .eq('student_id', studentId)
      .order('term_year', { ascending: false }).order('term_block', { ascending: false }).order('course_name'),
    sb.from('academic_student_enrollments').select('id, academic_programs(name)').eq('student_id', studentId),
    sb.from('academic_students').select('document_number').eq('id', studentId).maybeSingle(),
  ])

  // De academic_grades (misma inscripción por external_id): estado de retiro y
  // si la nota es editable (solo SystemActiva, no Moodle). Defensa: si faltan
  // columnas (migración sin correr), no filtra ni marca.
  const withdrawn = new Set<string>()
  const editableByExt = new Map<string, boolean>()
  if (stu?.document_number) {
    const r = await sb.from('academic_grades').select('external_id, withdrawn_at, source, moodle_course_id')
      .eq('document_number', stu.document_number)
    if (!r.error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const w of (r.data ?? []) as any[]) {
        if (w.withdrawn_at) withdrawn.add(String(w.external_id))
        editableByExt.set(String(w.external_id), w.source === 'systemactiva' && !w.moodle_course_id)
      }
    }
  }

  const progByEnr = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enr ?? []) as any[]) progByEnr.set(e.id, e.academic_programs?.name ?? 'Programa')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((details ?? []) as any[]).filter(d => !withdrawn.has(String(d.external_id))).map(d => ({
    ...d,
    program_name: d.enrollment_id ? (progByEnr.get(d.enrollment_id) ?? 'Sin programa') : 'Sin programa',
    editable: editableByExt.get(String(d.external_id)) ?? false,
  }))

  return NextResponse.json({ details: rows })
}
