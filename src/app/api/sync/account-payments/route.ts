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

const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

// POST (CRON_SECRET) — carga pagos desde SystemActiva Payments.
// student_id se resuelve vía enrollment.external_id (= EnrollmentId de la cuota que paga).
// Body: array [{ external_id, charge_external_id, enrollment_external_id, amount, paid_date,
//                disbursement_date, receipt_number, series_code, transaction_reference, payment_type }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  // Mapa enrollment.external_id -> student_id  (paginado)
  const stuByEnr = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('academic_student_enrollments')
      .select('external_id, student_id')
      .not('external_id', 'is', null)
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const e of data) if (e.external_id) stuByEnr.set(e.external_id, e.student_id)
    if (data.length < 1000) break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  let unmatched = 0
  for (const r of rows) {
    const student_id = r.enrollment_external_id ? stuByEnr.get(r.enrollment_external_id) ?? null : null
    if (!student_id) unmatched++
    toUpsert.push({
      external_id: r.external_id,
      charge_external_id: r.charge_external_id ?? null,
      student_id,
      amount: num(r.amount),
      paid_date: ymd(r.paid_date),
      disbursement_date: ymd(r.disbursement_date),
      receipt_number: int(r.receipt_number),
      series_code: r.series_code ?? null,
      transaction_reference: r.transaction_reference ?? null,
      payment_type: int(r.payment_type),
    })
  }

  let upserted = 0
  for (let i = 0; i < toUpsert.length; i += 500) {
    const chunk = toUpsert.slice(i, i + 500)
    const { error } = await sb.from('account_payments').upsert(chunk, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: error.message, upserted }, { status: 500 })
    upserted += chunk.length
  }

  return NextResponse.json({ ok: true, total: rows.length, upserted, unmatched_student: unmatched })
}
