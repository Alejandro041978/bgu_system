import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { sameCourse } from '@/lib/course-match'
import { fetchByIn } from '@/lib/grades-write'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Acta de asignatura (course report).
// GET                      → catálogo de programas
// GET ?program_id=         → asignaturas del programa
// GET ?course_id=          → el acta: todos los estudiantes con nota en esa
//                            asignatura (emparejada por código exacto o nombre
//                            vía course-match, igual que todo el sistema).
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const programId = req.nextUrl.searchParams.get('program_id')
  const courseId = req.nextUrl.searchParams.get('course_id')

  if (!programId && !courseId) {
    const { data: programs } = await sb.from('academic_programs')
      .select('id, name, academic_programs_category(name)').order('name')
    return NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      programs: ((programs ?? []) as any[]).map(p => ({ id: p.id, name: p.name, category: p.academic_programs_category?.name ?? '' })),
    })
  }

  if (programId && !courseId) {
    const { data: courses } = await sb.from('academic_courses')
      .select('id, code, name, level').eq('program_id', programId).order('level').order('code')
    return NextResponse.json({ courses: courses ?? [] })
  }

  // El acta
  const { data: course } = await sb.from('academic_courses')
    .select('id, code, name, program_id, academic_programs(name, category_id)').eq('id', courseId).maybeSingle()
  if (!course) return NextResponse.json({ error: 'Asignatura no encontrada' }, { status: 404 })

  let passing: number | null = null
  if (course.academic_programs?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category')
      .select('passing_score').eq('id', course.academic_programs.category_id).maybeSingle()
    passing = cat?.passing_score ?? null
  }

  // Estudiantes del programa (el acta es de la asignatura EN su programa: no
  // arrastra homónimos de otros programas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enr: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('student_id').eq('program_id', course.program_id).range(from, from + 999)
    const chunk = data ?? []
    enr.push(...chunk)
    if (chunk.length < 1000) break
  }
  const studentIds = [...new Set((enr as { student_id: string }[]).map(e => e.student_id))]
  const students = await fetchByIn(sb, 'academic_students',
    'id, document_number, first_name, last_name, second_last_name', 'id', studentIds)
  const byDoc = new Map(students.map(s => [String(s.document_number ?? ''), s]))
  const docs = [...byDoc.keys()].filter(Boolean)

  // Notas de esos estudiantes que correspondan a la asignatura (paginado:
  // PostgREST corta en 1000 y un lote de documentos trae muchas más)
  const grades = await fetchByIn(sb, 'academic_grades',
    'external_id, document_number, course_code, course_name, term_year, term_block, final_grade, retake_grade, passing_score, source, edited_at, locked_at',
    'document_number', docs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of grades as any[]) {
      if (!((course.code && g.course_code && String(g.course_code) === String(course.code)) || sameCourse(g.course_name, course.name))) continue
      const stu = byDoc.get(String(g.document_number))
      const efectiva = g.retake_grade ?? g.final_grade
      const umbral = g.passing_score ?? passing
      rows.push({
        document: String(g.document_number),
        student_name: stu ? [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ') : (g.student_name ?? '?'),
        term_year: g.term_year, term_block: g.term_block,
        final_grade: g.final_grade, retake_grade: g.retake_grade,
        efectiva,
        estado: efectiva == null ? 'en_curso' : (umbral == null || Number(efectiva) >= Number(umbral)) ? 'aprobado' : 'desaprobado',
        source: g.source ?? null,
        edited: !!g.edited_at, locked: !!g.locked_at,
      })
    }
  }
  rows.sort((a, b) => String(a.student_name).localeCompare(String(b.student_name)))

  const terms = [...new Set(rows.map(r => `${r.term_year ?? '—'} · ${r.term_block ?? '—'}`))].sort().reverse()
  const conNota = rows.filter(r => r.efectiva != null)
  return NextResponse.json({
    course: { id: course.id, code: course.code, name: course.name, program: course.academic_programs?.name ?? '', passing },
    resumen: {
      total: rows.length,
      aprobados: rows.filter(r => r.estado === 'aprobado').length,
      desaprobados: rows.filter(r => r.estado === 'desaprobado').length,
      en_curso: rows.filter(r => r.estado === 'en_curso').length,
      promedio: conNota.length ? Math.round(conNota.reduce((s, r) => s + Number(r.efectiva), 0) / conNota.length * 10) / 10 : null,
    },
    terms,
    rows,
  })
}
