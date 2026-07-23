import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyFlywireSignature, FLYWIRE_PAID_STATUSES } from '@/lib/flywire'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

// POST — Notificación de pago de Flywire (Notifications v2).
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const digest = req.headers.get('x-flywire-digest')
  const valid = verifyFlywireSignature(raw, digest)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null
  try { body = JSON.parse(raw) } catch { /* cuerpo no-JSON */ }

  const paymentId = body?.payment_id ?? body?.id ?? null
  const externalRef = body?.external_reference ?? body?.callback_id ?? null
  const status = (body?.status ?? body?.payment_status ?? '').toLowerCase()
  const eventType = body?.event_type ?? null

  const sb = db()

  // 1) Log crudo (auditoría), siempre
  await sb.from('flywire_events').insert({
    payment_id: paymentId, external_reference: externalRef, status, event_type: eventType,
    amount_from: num(body?.amount_from), currency_from: body?.currency_from ?? null,
    amount_to: num(body?.amount_to), currency_to: body?.currency_to ?? null,
    signature_valid: valid, raw: body ?? { raw },
  })

  // 2) Firma inválida → no actuamos (Flywire reintentará)
  if (!valid) return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  if (!externalRef) return NextResponse.json({ ok: true, note: 'sin external_reference' })

  // 3) Ubicar la cuota
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, student_id, enrollment_id, convocatoria_id, amount')
    .eq('external_id', externalRef).maybeSingle()
  if (!charge) return NextResponse.json({ ok: true, note: 'cuota no encontrada' })

  // Reflejar el estado Flywire en la cuota
  await sb.from('account_charges').update({ flywire_status: status, flywire_payment_id: paymentId })
    .eq('external_id', externalRef)

  if (FLYWIRE_PAID_STATUSES.has(status) && paymentId) {
    // Idempotencia: no duplicar el pago si ya lo registramos
    const { data: exists } = await sb.from('account_payments')
      .select('id').eq('flywire_payment_id', paymentId).maybeSingle()
    if (!exists) {
      // Saldo actual de la cuota (para marcarla pagada en pago de cuota completa)
      const { data: pays } = await sb.from('account_payments').select('amount').eq('charge_external_id', externalRef)
      const paid = (pays ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0)
      const balance = Math.round((Number(charge.amount ?? 0) - paid) * 100) / 100
      const amount = balance > 0 ? balance : Number(charge.amount ?? 0)

      await sb.from('account_payments').insert({
        external_id: crypto.randomUUID(),
        charge_external_id: externalRef,
        student_id: charge.student_id ?? null,
        amount,
        paid_date: new Date().toISOString().slice(0, 10),
        transaction_reference: `Flywire ${paymentId}`,
        flywire_payment_id: paymentId,
      })

      // Si este pago cubrió los conceptos iniciales, la matrícula se activa
      // sola (correo estudiantil, acta, carrusel y Moodle).
      try { await maybeActivateOnPayment(externalRef) } catch { /* la importación/el botón Activar recuperan */ }
    }
  } else if (status === 'reversed' && paymentId) {
    // Reverso → elimina el pago registrado de este payment_id
    await sb.from('account_payments').delete().eq('flywire_payment_id', paymentId)
  }

  return NextResponse.json({ ok: true })
}
