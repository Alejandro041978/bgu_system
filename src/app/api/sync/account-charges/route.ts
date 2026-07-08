import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ymd = (d: string | null | undefined): string | null => {
  if (!d) return null
  const s = String(d).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

type Enr = { enrollment_id: string; convocatoria_id: string | null }

// POST (CRON_SECRET) — carga cuotas (deuda) desde SystemActiva Installments.
// Resuelve student_id / enrollment_id / convocatoria_id:
//   1) por enrollment_external_id (= EnrollmentId) contra academic_student_enrollments.id
//   2) fallback: por document_number → estudiante (y su matrícula si tiene una sola)
// Body: array [{ external_id, enrollment_external_id, document_number, amount, due_date, charge_type, course_registration_external_id }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  // Matrículas: id -> { student_id, convocatoria_id } y por-estudiante (para detectar matrícula única)
  const enrById = new Map<string, { student_id: string; convocatoria_id: string | null }>()
  const enrByStudent = new Map<string, Enr[]>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('academic_student_enrollments')
      .select('id, student_id, convocatoria_id')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const e of data) {
      enrById.set(e.id, { student_id: e.student_id, convocatoria_id: e.convocatoria_id })
      const list = enrByStudent.get(e.student_id) ?? []
      list.push({ enrollment_id: e.id, convocatoria_id: e.convocatoria_id })
      enrByStudent.set(e.student_id, list)
    }
    if (data.length < 1000) break
  }

  // Estudiantes: document_number -> id  (para el fallback)
  const stuByDoc = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('academic_students')
      .select('id, document_number')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const s of data) if (s.document_number) stuByDoc.set(String(s.document_number), s.id)
    if (data.length < 1000) break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  let unmatched = 0
  for (const r of rows) {
    let student_id: string | null = null
    let enrollment_id: string | null = null
    let convocatoria_id: string | null = null

    const enr = r.enrollment_external_id ? enrById.get(r.enrollment_external_id) : undefined
    if (enr) {
      student_id = enr.student_id
      enrollment_id = r.enrollment_external_id
      convocatoria_id = enr.convocatoria_id
    } else if (r.document_number) {
      student_id = stuByDoc.get(String(r.document_number)) ?? null
      if (student_id) {
        const list = enrByStudent.get(student_id)
        if (list && list.length === 1) {
          enrollment_id = list[0].enrollment_id
          convocatoria_id = list[0].convocatoria_id
        }
      }
    }
    if (!student_id) unmatched++

    toUpsert.push({
      external_id: r.external_id,
      student_id,
      enrollment_id,
      convocatoria_id,
      amount: num(r.amount),
      due_date: ymd(r.due_date),
      charge_type: r.charge_type ?? null,
      course_registration_external_id: r.course_registration_external_id ?? null,
    })
  }

  let upserted = 0
  for (let i = 0; i < toUpsert.length; i += 500) {
    const chunk = toUpsert.slice(i, i + 500)
    const { error } = await sb.from('account_charges').upsert(chunk, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: error.message, upserted }, { status: 500 })
    upserted += chunk.length
  }

  return NextResponse.json({ ok: true, total: rows.length, upserted, unmatched_student: unmatched })
}
