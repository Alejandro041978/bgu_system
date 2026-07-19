import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { fetchByIn } from '@/lib/grades-write'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?convocatoria_id= → los estudiantes de la convocatoria: suma por
// programa y lista (un estudiante puede matricular más de un programa en la
// misma convocatoria; la lista lo agrupa con todos sus programas).
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria_id')
  if (!convocatoriaId) return NextResponse.json({ error: 'Falta convocatoria_id' }, { status: 400 })

  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enr: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('student_id, program_id, enrollment_date')
      .eq('convocatoria_id', convocatoriaId).range(from, from + 999)
    const chunk = data ?? []
    enr.push(...chunk)
    if (chunk.length < 1000) break
  }

  const programIds = [...new Set(enr.map(e => e.program_id).filter(Boolean))] as string[]
  const { data: progs } = programIds.length
    ? await sb.from('academic_programs').select('id, name').in('id', programIds)
    : { data: [] }
  const progName = new Map(((progs ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))

  const studentIds = [...new Set(enr.map(e => e.student_id).filter(Boolean))] as string[]
  const students = await fetchByIn(sb, 'academic_students',
    'id, document_number, first_name, last_name, second_last_name, situation', 'id', studentIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stuOf = new Map<string, any>(students.map(s => [s.id, s]))

  // Suma por programa (matrículas)
  const porPrograma = new Map<string, number>()
  for (const e of enr) {
    const n = progName.get(e.program_id) ?? '(sin programa)'
    porPrograma.set(n, (porPrograma.get(n) ?? 0) + 1)
  }

  // Lista de estudiantes con sus programas en esta convocatoria
  const byStudent = new Map<string, { programs: string[]; fecha: string | null }>()
  for (const e of enr) {
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, { programs: [], fecha: e.enrollment_date ?? null })
    const s = byStudent.get(e.student_id)!
    const n = progName.get(e.program_id) ?? '(sin programa)'
    if (!s.programs.includes(n)) s.programs.push(n)
    if (e.enrollment_date && (!s.fecha || e.enrollment_date < s.fecha)) s.fecha = e.enrollment_date
  }
  const rows = [...byStudent.entries()].map(([sid, v]) => {
    const s = stuOf.get(sid)
    return {
      name: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '?',
      document: s ? String(s.document_number ?? '') : '',
      situation: s?.situation ?? null,
      programs: v.programs,
      fecha: v.fecha,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    matriculas: enr.length,
    estudiantes: rows.length,
    por_programa: [...porPrograma.entries()].sort((a, b) => b[1] - a[1]).map(([programa, n]) => ({ programa, n })),
    rows,
  })
}
