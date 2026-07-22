import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { eligibleCourses, createExamRequest } from '@/lib/exam-requests'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveStudent(sb: any, ident: { email: string | null; document_number: string | null }) {
  if (ident.email) {
    const { data } = await sb.from('academic_students')
      .select('id, document_number').eq('email', ident.email).eq('disabled', false).maybeSingle()
    if (data) return data
  }
  if (ident.document_number) {
    const { data } = await sb.from('academic_students')
      .select('id, document_number').eq('document_number', ident.document_number).maybeSingle()
    if (data) return data
  }
  return null
}

// GET → tipos de examen activos + asignaturas elegibles + mis solicitudes
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'Sin estudiante' }, { status: 403 })

  const sb = db()
  const stu = await resolveStudent(sb, ident)
  if (!stu) return NextResponse.json({ types: [], eligible: [], requests: [] })

  const [{ data: types }, eligible, { data: requests }] = await Promise.all([
    sb.from('exam_types').select('id, name, price').eq('active', true).order('name'),
    eligibleCourses(sb, stu.id, stu.document_number ? String(stu.document_number) : null),
    sb.from('exam_requests')
      .select('id, course_code, course_name, status, requested_at, paid_at, result_grade, exam_types(name, price)')
      .eq('student_id', stu.id).order('requested_at', { ascending: false }),
  ])

  return NextResponse.json({ types: types ?? [], eligible, requests: requests ?? [] })
}

// POST { exam_type_id, grade_external_id } → solicita el examen (crea el cargo)
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'Sin estudiante' }, { status: 403 })

  const b = await req.json().catch(() => null) as { exam_type_id?: string; grade_external_id?: string } | null
  if (!b?.exam_type_id || !b?.grade_external_id) {
    return NextResponse.json({ error: 'Faltan exam_type_id y grade_external_id' }, { status: 400 })
  }

  const sb = db()
  const stu = await resolveStudent(sb, ident)
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const r = await createExamRequest(stu.id, stu.document_number ? String(stu.document_number) : null, b.exam_type_id, b.grade_external_id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, charge: r.charge })
}
