import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperadmin } from '@/lib/student-identity'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { maybeMarkExamPaid } from '@/lib/exam-requests'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Descuento sobre una cuota (regla del usuario 2026-07-23): SOLO superadmin
// por ahora (luego vendrá un mecanismo controlado, y las becas seguirán esta
// misma estructura). Se registra como un "pago" con serie DESCUENTO y su
// código: reduce la deuda total o parcialmente, pero suma en su propia
// columna del estado de cuenta (no es ingreso).
// POST { charge_external_id, amount, code?, note? }
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(await isSuperadmin(user.id))) {
    return NextResponse.json({ error: 'Solo el superadministrador puede aplicar descuentos (el mecanismo controlado vendrá después)' }, { status: 403 })
  }

  const b = await req.json().catch(() => null) as {
    charge_external_id?: string; amount?: number; code?: string; note?: string
  } | null
  const amount = Number(b?.amount)
  if (!b?.charge_external_id || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Faltan charge_external_id y amount (> 0)' }, { status: 400 })
  }

  const sb = db()
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, student_id, amount').eq('external_id', b.charge_external_id).maybeSingle()
  if (!charge) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })

  // Saldo vivo de la cuota (pagos + descuentos previos)
  const { data: pays } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', b.charge_external_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cubierto = ((pays ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const saldo = Number(charge.amount) - cubierto
  if (saldo <= 0.01) return NextResponse.json({ error: 'La cuota ya está saldada' }, { status: 409 })
  if (amount > saldo + 0.01) {
    return NextResponse.json({ error: `El descuento (${amount.toFixed(2)}) supera el saldo de la cuota (${saldo.toFixed(2)})` }, { status: 400 })
  }

  const code = (b.code?.trim().toUpperCase() || `DSC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`)
  const { error } = await sb.from('account_payments').insert({
    external_id: crypto.randomUUID(),
    charge_external_id: b.charge_external_id,
    student_id: charge.student_id,
    amount,
    paid_date: new Date().toISOString().slice(0, 10),
    series_code: 'DESCUENTO',
    transaction_reference: b.note?.trim() ? `${code} · ${b.note.trim()}` : code,
    payment_method: 'discount',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Un descuento que salda la cuota dispara los mismos gates que un pago
  // (activación de matrícula por concepto inicial, examen a la Hoja de Control)
  await maybeActivateOnPayment(b.charge_external_id).catch(() => null)
  await maybeMarkExamPaid(b.charge_external_id).catch(() => null)

  return NextResponse.json({ ok: true, code, amount, saldo_restante: Math.round((saldo - amount) * 100) / 100 })
}
