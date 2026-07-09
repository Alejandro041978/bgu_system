import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

// POST (CRON_SECRET) — carga el detalle de calificaciones desde SystemActiva.
// Resuelve student_id / enrollment_id por enrollment.id (= EnrollmentId), fallback document_number.
// Body: array [{ external_id, enrollment_external_id, document_number, course_code, course_name,
//   term_year, term_block, final_grade, retake_grade, makeup_grade, extra_points, passing_score,
//   max_score, grades, process_grades }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  // Matrícula.id -> student_id
  const stuByEnr = new Map<string, string>()
  const enrExists = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('academic_student_enrollments')
      .select('id, student_id').range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const e of data) { stuByEnr.set(e.id, e.student_id); enrExists.add(e.id) }
    if (data.length < 1000) break
  }
  // document_number -> student_id (fallback)
  const stuByDoc = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('academic_students').select('id, document_number').range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const s of data) if (s.document_number) stuByDoc.set(String(s.document_number), s.id)
    if (data.length < 1000) break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  let unmatched = 0
  for (const r of rows) {
    const enrId = r.enrollment_external_id && enrExists.has(r.enrollment_external_id) ? r.enrollment_external_id : null
    let student_id: string | null = enrId ? stuByEnr.get(enrId) ?? null : null
    if (!student_id && r.document_number) student_id = stuByDoc.get(String(r.document_number)) ?? null
    if (!student_id) unmatched++
    toUpsert.push({
      external_id: r.external_id,
      student_id,
      enrollment_id: enrId,
      course_code: r.course_code ?? null,
      course_name: r.course_name ?? null,
      term_year: int(r.term_year),
      term_block: r.term_block ?? null,
      final_grade: num(r.final_grade),
      retake_grade: num(r.retake_grade),
      makeup_grade: num(r.makeup_grade),
      extra_points: num(r.extra_points),
      passing_score: num(r.passing_score),
      max_score: num(r.max_score),
      grades: r.grades ?? null,
      process_grades: r.process_grades ?? null,
    })
  }

  let upserted = 0
  for (let i = 0; i < toUpsert.length; i += 500) {
    const chunk = toUpsert.slice(i, i + 500)
    const { error } = await sb.from('academic_grade_details').upsert(chunk, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: error.message, upserted }, { status: 500 })
    upserted += chunk.length
  }

  return NextResponse.json({ ok: true, total: rows.length, upserted, unmatched_student: unmatched })
}
