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

// POST (CRON_SECRET) — carga cuotas (deuda) desde SystemActiva Installments.
// Resuelve student_id / enrollment_id / convocatoria_id vía enrollment.external_id (= EnrollmentId).
// Body: array [{ external_id, enrollment_external_id, amount, due_date, charge_type, course_registration_external_id }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  // Mapa enrollment.external_id -> { id, student_id, convocatoria_id }  (paginado, supera el tope de 1000)
  const enrMap = new Map<string, { id: string; student_id: string; convocatoria_id: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('academic_student_enrollments')
      .select('id, external_id, student_id, convocatoria_id')
      .not('external_id', 'is', null)
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const e of data) if (e.external_id) enrMap.set(e.external_id, { id: e.id, student_id: e.student_id, convocatoria_id: e.convocatoria_id })
    if (data.length < 1000) break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  let unmatched = 0
  for (const r of rows) {
    const enr = r.enrollment_external_id ? enrMap.get(r.enrollment_external_id) : undefined
    if (!enr) unmatched++
    toUpsert.push({
      external_id: r.external_id,
      student_id: enr?.student_id ?? null,
      enrollment_id: enr?.id ?? null,
      convocatoria_id: enr?.convocatoria_id ?? null,
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

  return NextResponse.json({ ok: true, total: rows.length, upserted, unmatched_enrollment: unmatched })
}
