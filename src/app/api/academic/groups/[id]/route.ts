import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → detalle del grupo: asignaturas del grupo, asignaturas disponibles (del mismo programa,
// sin grupo) y estudiantes asociados.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const sb = db()

  const { data: group } = await sb.from('academic_groups')
    .select('id, abbreviation, name, detail, program_id, academic_programs(name)')
    .eq('id', id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // Cursos del programa (para acotar las asignaturas disponibles)
  const { data: courses } = await sb.from('academic_courses').select('id').eq('program_id', group.program_id)
  const courseIds = (courses ?? []).map((c: { id: string }) => c.id)

  const OFF = 'id, group_id, course:academic_courses(id, name, code), assignments:faculty_assignments(employee:hr_employees(full_name))'
  const [{ data: offerings }, availableRes, { data: members }] = await Promise.all([
    sb.from('semester_offerings').select(OFF).eq('group_id', id),
    courseIds.length
      ? sb.from('semester_offerings').select(OFF).is('group_id', null).in('course_id', courseIds)
      : Promise.resolve({ data: [] }),
    sb.from('academic_group_students').select('student_id, academic_students(id, first_name, last_name, second_last_name, document_number)').eq('group_id', id),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapOff = (o: any) => ({
    id: o.id, course_name: o.course?.name ?? '—', course_code: o.course?.code ?? null,
    teacher: o.assignments?.[0]?.employee?.full_name ?? null,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = (members ?? []).map((m: any) => {
    const s = m.academic_students
    return { id: s?.id ?? m.student_id, name: [s?.first_name, s?.last_name, s?.second_last_name].filter(Boolean).join(' '), document_number: s?.document_number ?? null }
  }).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

  return NextResponse.json({
    group: {
      id: group.id, abbreviation: group.abbreviation, name: group.name, detail: group.detail,
      program_name: group.academic_programs?.name ?? '',
    },
    offerings: (offerings ?? []).map(mapOff),
    available: (availableRes.data ?? []).map(mapOff),
    students,
  })
}
