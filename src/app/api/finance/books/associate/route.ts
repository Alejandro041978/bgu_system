import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { getAccountStatement } from '@/lib/account-statement'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { maybeMarkExamPaid } from '@/lib/exam-requests'
import { maybeMarkDocumentPaid } from '@/lib/document-request'
import { refreshAccessForStudents } from '@/lib/moodle-access'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// GET ?student=<id> → cuotas del estudiante (para elegir a cuál asociar el ingreso)
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const studentId = req.nextUrl.searchParams.get('student')
  if (!studentId) return NextResponse.json({ error: 'Falta student' }, { status: 400 })
  const st = await getAccountStatement({ studentId })
  // Aplana cuotas de todos los programas con su saldo
  const cuotas = st.programs.flatMap(p => p.charges.map(c => ({
    external_id: c.external_id, program_name: p.program_name,
    concept: c.concept_abbr, concept_name: c.concept_name,
    amount: c.amount, balance: c.balance, due_date: c.due_date, status: c.status,
  })))
  return NextResponse.json({ student: st.student, cuotas })
}

// POST { operation_id, allocations: [{charge_external_id, amount}] } → REPARTE el
// ingreso de Books entre una o varias cuotas (p. ej. un depósito que junta
// enrollment + tuition). Crea un pago serie BOOKS por cada porción. La suma no
// puede superar el monto del ingreso. Cuotas separadas: NO se unifican.
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const user = g.user
  const b = await req.json().catch(() => null) as {
    operation_id?: string; allocations?: { charge_external_id?: string; amount?: number }[]
  } | null
  const allocs = (b?.allocations ?? []).filter(a => a.charge_external_id && Number(a.amount) > 0)
  if (!b?.operation_id || !allocs.length) return NextResponse.json({ error: 'Faltan la operación o las cuotas a asociar' }, { status: 400 })
  const sb = db()

  const { data: op } = await sb.from('books_operations')
    .select('id, credit, amount, txn_date, reference, contact_name, account_name').eq('id', b.operation_id).maybeSingle()
  if (!op) return NextResponse.json({ error: 'Operación de Books no encontrada' }, { status: 404 })
  const monto = op.credit != null ? Number(op.credit) : Number(op.amount ?? 0)
  if (!(monto > 0)) return NextResponse.json({ error: 'La operación no tiene un monto de ingreso (crédito) válido' }, { status: 400 })

  const { count: yaAsoc } = await sb.from('account_payments').select('id', { count: 'exact', head: true }).eq('books_operation_id', op.id)
  if ((yaAsoc ?? 0) > 0) return NextResponse.json({ error: 'Esta operación ya está asociada. Desasóciala primero para rehacerla.' }, { status: 409 })

  const total = Math.round(allocs.reduce((s, a) => s + Number(a.amount), 0) * 100) / 100
  if (total > monto + 0.01) return NextResponse.json({ error: `La suma a asociar (${total.toFixed(2)}) supera el monto del ingreso (${monto.toFixed(2)})` }, { status: 400 })

  const ref = `Books: ${op.reference || op.id.slice(0, 8)}${op.contact_name ? ` · ${op.contact_name}` : ''}`
  const paidDate = op.txn_date || new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (const a of allocs) {
    const { data: ch } = await sb.from('account_charges').select('external_id, student_id').eq('external_id', a.charge_external_id).maybeSingle()
    if (!ch) return NextResponse.json({ error: `Cuota ${a.charge_external_id} no encontrada` }, { status: 404 })
    rows.push({
      external_id: crypto.randomUUID(), charge_external_id: ch.external_id, student_id: ch.student_id,
      amount: Math.round(Number(a.amount) * 100) / 100, paid_date: paidDate,
      series_code: 'BOOKS', transaction_reference: ref, payment_method: 'books', books_operation_id: op.id,
    })
  }
  const { error: pErr } = await sb.from('account_payments').insert(rows)
  if (pErr) return NextResponse.json({ error: 'Error al crear los pagos: ' + pErr.message }, { status: 500 })

  await sb.from('books_operations').update({
    gestion_status: 'asociada',
    gestion_note: `${rows.length} cuota(s) · ${total.toFixed(2)} de ${monto.toFixed(2)} · pago Books`,
    gestion_by: user.email ?? user.id, gestion_at: new Date().toISOString(),
  }).eq('id', op.id)

  for (const r of rows) {
    await maybeActivateOnPayment(r.charge_external_id).catch(() => null)
    await maybeMarkExamPaid(r.charge_external_id).catch(() => null)
    await maybeMarkDocumentPaid(r.charge_external_id).catch(() => null)
  }
  // Reactiva Moodle si el pago dejó al estudiante sin vencido
  await refreshAccessForStudents(sb, rows.map(r => r.student_id)).catch(() => null)
  return NextResponse.json({ ok: true, pagos: rows.length, total })
}

// DELETE { operation_id } → DESASOCIA: borra los pagos Books de esa operación y
// la devuelve a 'pendiente' (para rehacer un reparto mal hecho).
export async function DELETE(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const b = await req.json().catch(() => null) as { operation_id?: string } | null
  if (!b?.operation_id) return NextResponse.json({ error: 'Falta operation_id' }, { status: 400 })
  const sb = db()
  const { error } = await sb.from('account_payments').delete().eq('books_operation_id', b.operation_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.from('books_operations').update({
    gestion_status: 'pendiente', associated_charge_external_id: null, associated_payment_id: null,
    gestion_note: null, gestion_by: null, gestion_at: null,
  }).eq('id', b.operation_id)
  return NextResponse.json({ ok: true })
}
