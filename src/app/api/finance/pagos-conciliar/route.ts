import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { fetchByIn } from '@/lib/grades-write'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET → pagos sin cuota enlazada (la bandeja) + cuotas impagas candidatas por estudiante
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()

  // select('*') para tolerar que reconciled_no_charge exista o no todavía
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('account_payments').select('*')
      .is('charge_external_id', null).range(from, from + 999)
    pending.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const rows = pending.filter(p => !p.reconciled_no_charge)

  const studentIds = [...new Set(rows.map(p => p.student_id).filter(Boolean))] as string[]
  const students = studentIds.length
    ? await fetchByIn(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number', 'id', studentIds)
    : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stuOf = new Map<string, any>(students.map(s => [s.id, s]))

  // Cuotas de esos estudiantes y cuáles ya están pagadas (enlazadas)
  const charges = studentIds.length
    ? await fetchByIn(sb, 'account_charges', 'external_id, student_id, amount, due_date', 'student_id', studentIds)
    : []
  const linked = studentIds.length
    ? await fetchByIn(sb, 'account_payments', 'charge_external_id, student_id', 'student_id', studentIds)
    : []
  const paidCharges = new Set(linked.map((p: { charge_external_id: string | null }) => p.charge_external_id).filter(Boolean))
  const openByStudent = new Map<string, { external_id: string; amount: number; due_date: string | null }[]>()
  for (const c of charges as { external_id: string; student_id: string; amount: number; due_date: string | null }[]) {
    if (paidCharges.has(c.external_id)) continue
    if (!openByStudent.has(c.student_id)) openByStudent.set(c.student_id, [])
    openByStudent.get(c.student_id)!.push({ external_id: c.external_id, amount: Number(c.amount), due_date: c.due_date })
  }
  for (const list of openByStudent.values()) list.sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1)

  return NextResponse.json({
    rows: rows.map(p => {
      const s = p.student_id ? stuOf.get(p.student_id) : null
      return {
        id: p.id,
        reference: p.flywire_payment_id ?? p.transaction_reference ?? p.external_id,
        source: p.flywire_payment_id ? 'Flywire' : (p.series_code ?? 'otro'),
        amount: Number(p.amount),
        paid_date: p.paid_date,
        student_id: p.student_id,
        student: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : null,
        document: s ? String(s.document_number ?? '') : null,
        candidates: p.student_id ? (openByStudent.get(p.student_id) ?? []) : [],
      }
    }).sort((a, b) => (a.paid_date ?? '') < (b.paid_date ?? '') ? -1 : 1),
  })
}

// PATCH { payment_id, charge_external_id } → enlaza el pago a esa cuota
// PATCH { payment_id, no_charge: true } → lo marca "sin cuota" (sale de la bandeja)
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { payment_id?: string; charge_external_id?: string; no_charge?: boolean } | null
  if (!b?.payment_id) return NextResponse.json({ error: 'Falta payment_id' }, { status: 400 })
  const sb = db()

  const { data: pay } = await sb.from('account_payments')
    .select('id, student_id, charge_external_id, flywire_payment_id').eq('id', b.payment_id).maybeSingle()
  if (!pay) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if (pay.charge_external_id) return NextResponse.json({ error: 'El pago ya tiene cuota enlazada' }, { status: 409 })

  if (b.no_charge) {
    const { error } = await sb.from('account_payments').update({ reconciled_no_charge: true }).eq('id', pay.id)
    if (error) return NextResponse.json({ error: `¿Corrió la migración flywire_conciliar.sql? ${error.message}` }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!b.charge_external_id) return NextResponse.json({ error: 'Falta charge_external_id o no_charge' }, { status: 400 })
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, student_id').eq('external_id', b.charge_external_id).maybeSingle()
  if (!charge) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
  if (charge.student_id !== pay.student_id) {
    return NextResponse.json({ error: 'La cuota no pertenece al estudiante del pago' }, { status: 400 })
  }
  const { data: already } = await sb.from('account_payments')
    .select('id').eq('charge_external_id', b.charge_external_id).limit(1)
  if ((already ?? []).length) return NextResponse.json({ error: 'Esa cuota ya tiene un pago enlazado' }, { status: 409 })

  const { error } = await sb.from('account_payments')
    .update({ charge_external_id: b.charge_external_id }).eq('id', pay.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (pay.flywire_payment_id) {
    await sb.from('account_charges')
      .update({ flywire_status: 'delivered', flywire_payment_id: pay.flywire_payment_id })
      .eq('external_id', b.charge_external_id)
  }
  return NextResponse.json({ ok: true })
}
