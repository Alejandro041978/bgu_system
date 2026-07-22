import { NextRequest, NextResponse } from 'next/server'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
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
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()

  // ?cuotas_de=<student_id> → cuotas ABIERTAS de ese estudiante (para elegir
  // el destino al registrar un pago Flywire sin registrar)
  const cuotasDe = req.nextUrl.searchParams.get('cuotas_de')
  if (cuotasDe) {
    const { data: cs } = await sb.from('account_charges')
      .select('external_id, amount, due_date, charge_type').eq('student_id', cuotasDe).order('due_date')
    const { data: ps } = await sb.from('account_payments')
      .select('charge_external_id, amount').eq('student_id', cuotasDe).not('charge_external_id', 'is', null)
    const paidBy = new Map<string, number>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (ps ?? []) as any[]) paidBy.set(p.charge_external_id, (paidBy.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cuotas = ((cs ?? []) as any[])
      .filter(c => (paidBy.get(c.external_id) ?? 0) < Number(c.amount) - 0.01)
      .map(c => ({ external_id: c.external_id, amount: Number(c.amount), due_date: c.due_date, pagado: paidBy.get(c.external_id) ?? 0 }))
    return NextResponse.json({ cuotas })
  }

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

  // Cuotas de esos estudiantes con SALDO vivo (el criterio es el saldo, no
  // "tiene algún pago": una cuota parcialmente pagada sigue siendo candidata)
  const charges = studentIds.length
    ? await fetchByIn(sb, 'account_charges', 'external_id, student_id, amount, due_date', 'student_id', studentIds)
    : []
  const linked = studentIds.length
    ? await fetchByIn(sb, 'account_payments', 'charge_external_id, amount, student_id', 'student_id', studentIds)
    : []
  const paidByCharge = new Map<string, number>()
  for (const p of linked as { charge_external_id: string | null; amount: number }[]) {
    if (!p.charge_external_id) continue
    paidByCharge.set(p.charge_external_id, (paidByCharge.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
  }
  const openByStudent = new Map<string, { external_id: string; amount: number; balance: number; due_date: string | null }[]>()
  for (const c of charges as { external_id: string; student_id: string; amount: number; due_date: string | null }[]) {
    const balance = Number(c.amount) - (paidByCharge.get(c.external_id) ?? 0)
    if (balance <= 0.01) continue
    if (!openByStudent.has(c.student_id)) openByStudent.set(c.student_id, [])
    openByStudent.get(c.student_id)!.push({ external_id: c.external_id, amount: Number(c.amount), balance: Math.round(balance * 100) / 100, due_date: c.due_date })
  }
  for (const list of openByStudent.values()) list.sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1)

  // Sección 2: pagos ENTREGADOS en Flywire que no existen como pago en el ERP
  // (sin estudiante resuelto, nombre ambiguo o excluidos a propósito al importar).
  // Viven en flywire_events; salen de aquí al registrarlos o descartarlos.
  const flyIds = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('account_payments')
      .select('flywire_payment_id').not('flywire_payment_id', 'is', null).range(from, from + 999)
    for (const p of (data ?? [])) flyIds.add(p.flywire_payment_id)
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('flywire_events')
      .select('payment_id, status, event_type, raw, received_at').range(from, from + 999)
    events.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const descartados = new Set(events.filter(e => e.event_type === 'resolution').map(e => e.payment_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bestByRef = new Map<string, any>()
  for (const e of events) {
    if (e.event_type === 'resolution' || !e.payment_id) continue
    if (!['delivered', 'guaranteed'].includes(e.status)) continue
    const curr = bestByRef.get(e.payment_id)
    if (!curr || (e.status === 'delivered' && curr.status !== 'delivered')) bestByRef.set(e.payment_id, e)
  }
  const sinRegistrar = [...bestByRef.values()]
    .filter(e => !flyIds.has(e.payment_id) && !descartados.has(e.payment_id))
    .map(e => ({
      reference: e.payment_id,
      status: e.status,
      name: [e.raw?.first_name, e.raw?.last_name].filter(Boolean).join(' ') || '(sin nombre)',
      dni: e.raw?.dni || null,
      amount: Number(e.raw?.amount) || 0,
      method: e.raw?.method || null,
      fecha: e.raw?.finished_date ? String(e.raw.finished_date).slice(0, 10) : null,
    }))
    .sort((a, b) => (a.fecha ?? '') < (b.fecha ?? '') ? -1 : 1)

  return NextResponse.json({
    rows: rows.map(p => {
      const s = p.student_id ? stuOf.get(p.student_id) : null
      // Un reembolso es SOMBRA de su pago de origen: no se concilia solo —
      // sigue a su origen cuando este se enlaza o se marca sin cuota.
      const refundOf = Number(p.amount) < 0
        ? (String(p.transaction_reference ?? '').match(/\(reembolso de (\S+)\)/)?.[1] ?? null)
        : null
      return {
        id: p.id,
        reference: p.flywire_payment_id ?? p.transaction_reference ?? p.external_id,
        source: p.flywire_payment_id ? 'Flywire' : (p.series_code ?? 'otro'),
        amount: Number(p.amount),
        paid_date: p.paid_date,
        student_id: p.student_id,
        student: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : null,
        document: s ? String(s.document_number ?? '') : null,
        refund_of: refundOf,
        candidates: refundOf ? [] : (p.student_id ? (openByStudent.get(p.student_id) ?? []) : []),
      }
    }).sort((a, b) => (a.paid_date ?? '') < (b.paid_date ?? '') ? -1 : 1),
    sin_registrar: sinRegistrar,
  })
}

// PATCH { payment_id, charge_external_id } → enlaza el pago a esa cuota
// PATCH { payment_id, no_charge: true } → lo marca "sin cuota" (sale de la bandeja)
// PATCH { flywire_ref, student_id } → registra el pago Flywire sin registrar para ese estudiante
// PATCH { flywire_ref, dismiss: true } → lo descarta (pruebas, no-estudiantes)
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    payment_id?: string; charge_external_id?: string; no_charge?: boolean
    flywire_ref?: string; student_id?: string; dismiss?: boolean; no_link?: boolean
    other_income?: { category?: string; note?: string }
  } | null
  const sb = db()

  if (b?.flywire_ref) {
    // El evento entregado más reciente de esa referencia
    const { data: evs } = await sb.from('flywire_events')
      .select('payment_id, status, event_type, raw').eq('payment_id', b.flywire_ref)
    const ev = (evs ?? []).find((e: { event_type: string; status: string }) => e.event_type !== 'resolution' && ['delivered', 'guaranteed'].includes(e.status))
    if (!ev) return NextResponse.json({ error: 'Referencia no encontrada en el log de Flywire' }, { status: 404 })

    if (b.dismiss) {
      const { error } = await sb.from('flywire_events').insert({
        payment_id: b.flywire_ref, event_type: 'resolution', status: 'descartado', raw: { por: 'humano' },
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Derivar a OTROS INGRESOS: dinero real que no es de un estudiante ni de
    // un programa (libros, eventos...). Sale de la bandeja vía evento de
    // resolución y queda tabulado en su propia página.
    if (b.other_income) {
      const raw = ev.raw ?? {}
      const cat = ['eventos', 'libros', 'viajes', 'otros'].includes(b.other_income.category ?? '')
        ? b.other_income.category : 'otros'
      const auth2 = await createAuthClient()
      const { data: { user: u2 } } = await auth2.auth.getUser()
      const { error: oiErr } = await sb.from('other_income').insert({
        flywire_ref: b.flywire_ref,
        payer_name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || null,
        payer_dni: raw.dni || null,
        amount: Number(raw.amount) || 0,
        method: raw.method || null,
        income_date: raw.finished_date ? String(raw.finished_date).slice(0, 10) : null,
        category: cat,
        note: b.other_income.note?.trim() || null,
        created_by: u2?.email ?? null,
      })
      if (oiErr) return NextResponse.json({ error: `¿Corrió la migración other_income.sql? ${oiErr.message}` }, { status: 500 })
      const { error } = await sb.from('flywire_events').insert({
        payment_id: b.flywire_ref, event_type: 'resolution', status: 'otros_ingresos', raw: { categoria: cat, por: u2?.email ?? 'humano' },
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, categoria: cat })
    }

    if (!b.student_id) return NextResponse.json({ error: 'Falta student_id o dismiss' }, { status: 400 })
    const { data: stu } = await sb.from('academic_students').select('id').eq('id', b.student_id).maybeSingle()
    if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
    const { data: dup } = await sb.from('account_payments').select('id').eq('flywire_payment_id', b.flywire_ref).limit(1)
    if ((dup ?? []).length) return NextResponse.json({ error: 'Esa referencia ya está registrada como pago' }, { status: 409 })

    const raw = ev.raw ?? {}
    const amount = Number(raw.amount) || 0
    const paidDate = raw.finished_date ? String(raw.finished_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
    // Cuota destino: elegida por el humano (charge_external_id), explícitamente
    // ninguna (no_link → queda en la bandeja de pagos sin cuota), o el
    // auto-calce por monto exacto de siempre.
    let chargeExt: string | null = null
    if (b.charge_external_id) {
      const { data: chosen } = await sb.from('account_charges')
        .select('external_id, student_id').eq('external_id', b.charge_external_id).maybeSingle()
      if (!chosen) return NextResponse.json({ error: 'Cuota elegida no encontrada' }, { status: 404 })
      if (chosen.student_id !== b.student_id) return NextResponse.json({ error: 'La cuota elegida no pertenece a ese estudiante' }, { status: 400 })
      chargeExt = chosen.external_id
    } else if (!b.no_link) {
      // Auto-calce por SALDO exacto (cubre también cuotas parcialmente pagadas)
      const { data: charges } = await sb.from('account_charges')
        .select('external_id, amount, due_date').eq('student_id', b.student_id).order('due_date', { ascending: true })
      const { data: paysOf } = await sb.from('account_payments')
        .select('charge_external_id, amount').eq('student_id', b.student_id).not('charge_external_id', 'is', null)
      const paidBy = new Map<string, number>()
      for (const p of (paysOf ?? []) as { charge_external_id: string; amount: number }[]) {
        paidBy.set(p.charge_external_id, (paidBy.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
      }
      const open = (charges ?? []).find((c: { external_id: string; amount: number }) =>
        Math.abs((Number(c.amount) - (paidBy.get(c.external_id) ?? 0)) - amount) < 0.01)
      if (open) chargeExt = open.external_id
    }

    const { error } = await sb.from('account_payments').insert({
      external_id: crypto.randomUUID(),
      flywire_payment_id: b.flywire_ref,
      charge_external_id: chargeExt,
      student_id: b.student_id,
      amount,
      paid_date: paidDate,
      series_code: 'FLYWIRE',
      transaction_reference: b.flywire_ref,
      payment_method: raw.method || null,
      currency_from: raw.currency || null,
      country_from: raw.country || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    let activated = null
    if (chargeExt) {
      await sb.from('account_charges')
        .update({ flywire_status: ev.status, flywire_payment_id: b.flywire_ref }).eq('external_id', chargeExt)
      // Gate de matrícula: si la cuota pagada era un concepto inicial, activa
      activated = await maybeActivateOnPayment(chargeExt).catch(() => null)
    }
    return NextResponse.json({ ok: true, linked: !!chargeExt, activated: activated?.ok ?? false })
  }

  if (!b?.payment_id) return NextResponse.json({ error: 'Falta payment_id' }, { status: 400 })

  const { data: pay } = await sb.from('account_payments')
    .select('id, student_id, charge_external_id, flywire_payment_id').eq('id', b.payment_id).maybeSingle()
  if (!pay) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if (pay.charge_external_id) return NextResponse.json({ error: 'El pago ya tiene cuota enlazada' }, { status: 409 })

  if (b.no_charge) {
    const { error } = await sb.from('account_payments').update({ reconciled_no_charge: true }).eq('id', pay.id)
    if (error) return NextResponse.json({ error: `¿Corrió la migración flywire_conciliar.sql? ${error.message}` }, { status: 500 })
    // Sus reembolsos lo siguen (salen de la bandeja junto con él)
    if (pay.flywire_payment_id) {
      await sb.from('account_payments').update({ reconciled_no_charge: true })
        .ilike('transaction_reference', `%(reembolso de ${pay.flywire_payment_id})%`)
    }
    return NextResponse.json({ ok: true })
  }

  if (!b.charge_external_id) return NextResponse.json({ error: 'Falta charge_external_id o no_charge' }, { status: 400 })
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, student_id').eq('external_id', b.charge_external_id).maybeSingle()
  if (!charge) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
  if (charge.student_id !== pay.student_id) {
    return NextResponse.json({ error: 'La cuota no pertenece al estudiante del pago' }, { status: 400 })
  }
  // Solo se rechaza si la cuota ya está SALDADA (una parcial acepta más pagos)
  const { data: chAmt } = await sb.from('account_charges')
    .select('amount').eq('external_id', b.charge_external_id).maybeSingle()
  const { data: already } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', b.charge_external_id)
  const yaPagado = (already ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0)
  if (yaPagado >= Number(chAmt?.amount ?? 0) - 0.01) {
    return NextResponse.json({ error: 'Esa cuota ya está totalmente pagada' }, { status: 409 })
  }

  const { error } = await sb.from('account_payments')
    .update({ charge_external_id: b.charge_external_id }).eq('id', pay.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (pay.flywire_payment_id) {
    await sb.from('account_charges')
      .update({ flywire_status: 'delivered', flywire_payment_id: pay.flywire_payment_id })
      .eq('external_id', b.charge_external_id)
    // Sus reembolsos van a la MISMA cuota (el reembolso es sombra del origen:
    // el neto de la cuota queda correcto y ambos salen de la bandeja juntos)
    await sb.from('account_payments').update({ charge_external_id: b.charge_external_id })
      .ilike('transaction_reference', `%(reembolso de ${pay.flywire_payment_id})%`)
  }
  // Gate de matrícula: si la cuota enlazada era un concepto inicial, activa
  const activated = await maybeActivateOnPayment(b.charge_external_id).catch(() => null)
  return NextResponse.json({ ok: true, activated: activated?.ok ?? false })
}
