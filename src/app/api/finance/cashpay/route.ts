import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// GET ?status= → bandeja de solicitudes de cashpay
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const sb = db()
  const status = req.nextUrl.searchParams.get('status') ?? 'pendiente'
  let q = sb.from('cashpay_requests').select('*').order('requested_at', { ascending: false }).limit(300)
  if (status !== 'todas') q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = [...new Set((data ?? []).map((r: { student_id: string }) => r.student_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stu = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ss } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email').in('id', ids.slice(i, i + 300))
    for (const s of ss ?? []) stu.set(s.id, s)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => {
    const s = stu.get(r.student_id)
    return { ...r, nombre: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '(sin estudiante)', documento: s?.document_number ?? null, email: s?.email ?? null }
  })
  return NextResponse.json({ solicitudes: rows })
}

// POST { id, action: 'aprobar'|'rechazar', note? }
// Aprobar APLICA el descuento: una fila serie DESCUENTO por cuota, prorrateando
// el ahorro. No se toca el monto de las cuotas — el descuento es trazable y
// reversible, igual que cualquier otro del estado de cuenta.
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const user = g.user
  const b = await req.json().catch(() => null) as { id?: string; action?: string; note?: string } | null
  if (!b?.id || !['aprobar', 'rechazar'].includes(b.action ?? '')) {
    return NextResponse.json({ error: 'Falta id o acción' }, { status: 400 })
  }
  const sb = db()
  const { data: r } = await sb.from('cashpay_requests').select('*').eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (r.status !== 'pendiente') return NextResponse.json({ error: `La solicitud ya está ${r.status}` }, { status: 409 })

  const now = new Date().toISOString()
  if (b.action === 'rechazar') {
    await sb.from('cashpay_requests').update({
      status: 'rechazada', reviewed_by: user.email ?? user.id, reviewed_at: now, review_note: b.note?.trim() || null,
    }).eq('id', b.id)
    return NextResponse.json({ ok: true, status: 'rechazada' })
  }

  // Recalcular el saldo REAL de cada cuota: entre la solicitud y la aprobación
  // el estudiante pudo pagar alguna.
  const charges: string[] = Array.isArray(r.charges) ? r.charges : []
  const { data: cs } = await sb.from('account_charges').select('external_id, amount, student_id').in('external_id', charges)
  const { data: ps } = await sb.from('account_payments').select('charge_external_id, amount').in('charge_external_id', charges)
  const pagado = new Map<string, number>()
  for (const p of ps ?? []) pagado.set(p.charge_external_id, (pagado.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
  const vivos = (cs ?? []).map((c: { external_id: string; amount: number }) => ({
    external_id: c.external_id, saldo: Math.round((Number(c.amount || 0) - (pagado.get(c.external_id) ?? 0)) * 100) / 100,
  })).filter((c: { saldo: number }) => c.saldo > 0.005)
  if (!vivos.length) return NextResponse.json({ error: 'Las cuotas de la solicitud ya están saldadas' }, { status: 409 })

  const base = vivos.reduce((s: number, c: { saldo: number }) => s + c.saldo, 0)
  const pct = Number(r.discount_pct)
  const code = `CASHPAY-${String(b.id).slice(0, 6).toUpperCase()}`
  const filas = vivos.map((c: { external_id: string; saldo: number }) => ({
    external_id: crypto.randomUUID(),
    charge_external_id: c.external_id,
    student_id: r.student_id,
    amount: Math.round(c.saldo * pct) / 100,       // prorrateo por cuota
    paid_date: now.slice(0, 10),
    series_code: 'DESCUENTO',
    transaction_reference: `${code} · Cashpay ${pct}% por adelantar ${r.months} meses`,
    payment_method: 'discount',
  })).filter((f: { amount: number }) => f.amount > 0)

  const { error } = await sb.from('account_payments').insert(filas)
  if (error) return NextResponse.json({ error: 'No se pudo aplicar el descuento: ' + error.message }, { status: 500 })

  await sb.from('cashpay_requests').update({
    status: 'aprobada', reviewed_by: user.email ?? user.id, reviewed_at: now,
    review_note: b.note?.trim() || null, applied_at: now,
    gross_amount: Math.round(base * 100) / 100,
    discount_amount: Math.round(base * pct) / 100,
    net_amount: Math.round(base * (100 - pct)) / 100,
  }).eq('id', b.id)

  return NextResponse.json({
    ok: true, status: 'aprobada', cuotas: filas.length,
    descuento: Math.round(base * pct) / 100, neto: Math.round(base * (100 - pct)) / 100,
  })
}
