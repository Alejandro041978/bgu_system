import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reembolsos Flywire: van en sentido CONTRARIO a los pagos — se registran como
// un pago NEGATIVO espejo del original (mismo estudiante, misma cuota si la
// había). El saldo (Σ cuotas − Σ pagos) revive solo. Nota: cuando el pago vino
// del histórico de Activa ya neteado (amount 0, "CHARGEBACK" en la referencia),
// NO se registra de nuevo — se detecta y se rechaza.
// POST { flywire_ref, refund_id, amount, refund_date }
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as {
    flywire_ref?: string; refund_id?: string; amount?: number; refund_date?: string
  } | null
  const ref = b?.flywire_ref?.trim().toUpperCase()
  const refundId = b?.refund_id?.trim().toUpperCase()
  const amount = Math.abs(Number(b?.amount) || 0)
  const date = b?.refund_date?.trim()
  if (!ref || !refundId || !amount || !date) {
    return NextResponse.json({ error: 'Faltan datos: referencia ZBL, ID de reembolso, monto y fecha' }, { status: 400 })
  }

  const sb = db()
  const { data: orig } = await sb.from('account_payments')
    .select('id, external_id, student_id, amount, charge_external_id, transaction_reference, reconciled_no_charge')
    .eq('flywire_payment_id', ref).maybeSingle()
  if (!orig) return NextResponse.json({ error: `No hay ningún pago registrado con la referencia ${ref}` }, { status: 404 })

  // Ya neteado por SystemActiva (pago histórico en 0 con marca CHARGEBACK)
  if (Number(orig.amount) === 0 && /chargeback/i.test(orig.transaction_reference ?? '')) {
    return NextResponse.json({ error: 'Este pago vino de SystemActiva ya neteado (CHARGEBACK, monto 0): el reembolso ya está reflejado, no se registra de nuevo' }, { status: 409 })
  }

  // Idempotencia por ID de reembolso
  const { data: dup } = await sb.from('account_payments')
    .select('id').ilike('transaction_reference', `%${refundId}%`).limit(1)
  if ((dup ?? []).length) return NextResponse.json({ error: `El reembolso ${refundId} ya está registrado` }, { status: 409 })

  const { data: stu } = await sb.from('academic_students')
    .select('first_name, last_name').eq('id', orig.student_id).maybeSingle()

  // El reembolso es SOMBRA del pago de origen: hereda su cuota (si la tiene) y
  // su marca "sin cuota"; si el origen aún no tiene destino, ambos quedan
  // juntos en la bandeja de conciliación y se resuelven juntos.
  const { error } = await sb.from('account_payments').insert({
    external_id: crypto.randomUUID(),
    student_id: orig.student_id,
    charge_external_id: orig.charge_external_id,
    amount: -amount,
    paid_date: date,
    series_code: 'FLYWIRE',
    transaction_reference: `${refundId} (reembolso de ${ref})`,
    payment_type: 6,               // convención de Activa para chargebacks
    payment_method: 'refund',
    reconciled_no_charge: orig.reconciled_no_charge ?? false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (orig.charge_external_id) {
    await sb.from('account_charges')
      .update({ flywire_status: 'refunded' }).eq('external_id', orig.charge_external_id)
  }
  // Embudo: el reembolso queda en el log de eventos
  const { data: seen } = await sb.from('flywire_events')
    .select('id').eq('payment_id', ref).eq('status', 'refunded').limit(1)
  if (!(seen ?? []).length) {
    await sb.from('flywire_events').insert({
      payment_id: ref, event_type: 'refund', status: 'refunded',
      raw: { refund_id: refundId, amount, refund_date: date, por: user.email ?? user.id },
    })
  }

  return NextResponse.json({
    ok: true,
    estudiante: [stu?.first_name, stu?.last_name].filter(Boolean).join(' ') || orig.student_id,
    monto: -amount,
    cuota_revivida: !!orig.charge_external_id,
  })
}
