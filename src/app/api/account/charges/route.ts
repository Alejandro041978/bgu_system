import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → conceptos de cuota disponibles (para el selector al crear una cuota).
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data } = await db().from('account_concepts')
    .select('type_code, abbr, name').eq('kind', 'charge').order('type_code', { ascending: true })
  return NextResponse.json({ concepts: data ?? [] })
}

// POST { enrollment_id, due_date, amount, charge_type, reference? } → crea una
// cuota manual en la cuenta de la matrícula. Requiere sesión.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as {
    enrollment_id?: string; due_date?: string | null; amount?: number; charge_type?: number | null; reference?: string | null
  } | null
  if (!b?.enrollment_id) return NextResponse.json({ error: 'Falta la matrícula' }, { status: 400 })
  const amount = Number(b.amount)
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'El monto debe ser un número positivo' }, { status: 400 })
  if (b.charge_type == null) return NextResponse.json({ error: 'Falta el concepto' }, { status: 400 })

  const sb = db()
  // La matrícula aporta student_id y convocatoria_id (fuente de verdad).
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, convocatoria_id').eq('id', b.enrollment_id).maybeSingle()
  if (!enr) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 })

  const { data, error } = await sb.from('account_charges').insert({
    external_id: crypto.randomUUID(),
    student_id: enr.student_id,
    enrollment_id: enr.id,
    convocatoria_id: enr.convocatoria_id ?? null,
    amount: Math.round(amount * 100) / 100,
    due_date: b.due_date || null,
    charge_type: Number(b.charge_type),
    reference: b.reference?.toString().trim() || null,
    is_initial: false,
    source: 'erp',
  }).select('external_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, external_id: data.external_id })
}

// DELETE { external_id } → borra una cuota del estado de cuenta (admin).
// Salvaguarda: una cuota con pagos enlazados NO se borra — primero hay que
// desenlazar o reasignar sus pagos (si no, quedarían huérfanos en silencio).
export async function DELETE(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as { external_id?: string } | null
  if (!b?.external_id) return NextResponse.json({ error: 'Falta external_id' }, { status: 400 })

  const sb = db()
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, amount, charge_type, student_id').eq('external_id', b.external_id).maybeSingle()
  if (!charge) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })

  const { count } = await sb.from('account_payments')
    .select('id', { count: 'exact', head: true }).eq('charge_external_id', b.external_id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `La cuota tiene ${count} pago(s) enlazado(s): desenlázalos antes de borrarla` }, { status: 409 })
  }

  const { error } = await sb.from('account_charges').delete().eq('external_id', b.external_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si la cuota nació de una solicitud de documento, la solicitud no puede
  // quedar esperando un pago que ya no existe: se cancela junto con ella.
  const { data: reqs } = await sb.from('document_requests')
    .select('id, status').eq('charge_external_id', b.external_id)
  let solicitud_cancelada = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (reqs ?? []) as any[]) {
    if (r.status === 'delivered') continue
    await sb.from('document_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', r.id)
    solicitud_cancelada = true
  }

  return NextResponse.json({ ok: true, solicitud_cancelada })
}
