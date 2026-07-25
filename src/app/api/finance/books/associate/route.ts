import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { getAccountStatement } from '@/lib/account-statement'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { maybeMarkExamPaid } from '@/lib/exam-requests'
import { maybeMarkDocumentPaid } from '@/lib/document-request'

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

// POST { operation_id, charge_external_id } → crea un pago serie BOOKS por el
// monto del ingreso de Books, enlazado a la cuota, y marca la operación asociada.
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const user = g.user
  const b = await req.json().catch(() => null) as { operation_id?: string; charge_external_id?: string } | null
  if (!b?.operation_id || !b?.charge_external_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  const sb = db()

  const { data: op } = await sb.from('books_operations')
    .select('id, credit, amount, txn_date, reference, contact_name, account_name, associated_payment_id').eq('id', b.operation_id).maybeSingle()
  if (!op) return NextResponse.json({ error: 'Operación de Books no encontrada' }, { status: 404 })
  if (op.associated_payment_id) return NextResponse.json({ error: 'Esta operación ya está asociada a una cuota' }, { status: 409 })
  const monto = op.credit != null ? Number(op.credit) : Number(op.amount ?? 0)
  if (!(monto > 0)) return NextResponse.json({ error: 'La operación no tiene un monto de ingreso (crédito) válido' }, { status: 400 })

  const { data: ch } = await sb.from('account_charges').select('external_id, student_id').eq('external_id', b.charge_external_id).maybeSingle()
  if (!ch) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })

  // Crea el pago serie BOOKS (segundo camino: dinero llegado a la cuenta bancaria)
  const payId = crypto.randomUUID()
  const ref = `Books: ${op.reference || op.id.slice(0, 8)}${op.contact_name ? ` · ${op.contact_name}` : ''}`
  const { error: pErr } = await sb.from('account_payments').insert({
    external_id: payId, charge_external_id: ch.external_id, student_id: ch.student_id,
    amount: monto, paid_date: op.txn_date || new Date().toISOString().slice(0, 10),
    series_code: 'BOOKS', transaction_reference: ref, payment_method: 'books',
  })
  if (pErr) return NextResponse.json({ error: 'Error al crear el pago: ' + pErr.message }, { status: 500 })

  // Marca la operación de Books como asociada (gestionada) con el enlace
  await sb.from('books_operations').update({
    gestion_status: 'asociada', associated_charge_external_id: ch.external_id, associated_payment_id: payId,
    gestion_note: `Cuota ${b.charge_external_id.slice(0, 8)} · pago Books ${ref}`,
    gestion_by: user.email ?? user.id, gestion_at: new Date().toISOString(),
  }).eq('id', op.id)

  // Gatillos de pago (matrícula/examen/documento)
  await maybeActivateOnPayment(ch.external_id).catch(() => null)
  await maybeMarkExamPaid(ch.external_id).catch(() => null)
  await maybeMarkDocumentPaid(ch.external_id).catch(() => null)

  return NextResponse.json({ ok: true, payment_id: payId, amount: monto })
}
