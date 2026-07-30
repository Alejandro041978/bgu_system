import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { getAccountStatement } from '@/lib/account-statement'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { maybeMarkExamPaid } from '@/lib/exam-requests'
import { maybeMarkDocumentPaid } from '@/lib/document-request'
import { maybeMarkTramitePaid } from '@/lib/tramites'
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

// GET ?student=<id> → cuotas Y pagos del estudiante.
//
// Las cuotas sirven para repartir un INGRESO; los pagos, para asociar una
// DEVOLUCIÓN. Una devolución no se asocia a una deuda: es dinero que vuelve al
// estudiante, así que su espejo es el pago que lo trajo.
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

  const sb = db()
  // Pagos reales del estudiante: los positivos. Los descuentos quedan fuera —
  // no son dinero que entró, así que no hay nada que devolver de ellos.
  const { data: pagos } = await sb.from('account_payments')
    .select('id, external_id, amount, paid_date, series_code, transaction_reference, payment_method, charge_external_id, refund_of_payment_id')
    .eq('student_id', studentId).order('paid_date', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todos = (pagos ?? []) as any[]
  // Cuánto se le devolvió ya a cada pago (los negativos apuntan al original).
  const devueltoPorPago = new Map<string, number>()
  for (const p of todos) {
    if (Number(p.amount) < 0 && p.refund_of_payment_id) {
      devueltoPorPago.set(p.refund_of_payment_id, (devueltoPorPago.get(p.refund_of_payment_id) ?? 0) + Math.abs(Number(p.amount)))
    }
  }
  const conceptoDe = new Map<string, string>()
  for (const p of st.programs) for (const c of p.charges) conceptoDe.set(c.external_id, `${c.concept_abbr} · ${c.concept_name}`)

  const pagosDisponibles = todos
    .filter(p => Number(p.amount) > 0 && p.series_code !== 'DESCUENTO')
    .map(p => {
      const devuelto = Math.round((devueltoPorPago.get(p.id) ?? 0) * 100) / 100
      return {
        id: p.id, external_id: p.external_id, amount: Number(p.amount), paid_date: p.paid_date,
        series_code: p.series_code, reference: p.transaction_reference, method: p.payment_method,
        charge_external_id: p.charge_external_id,
        charge_label: p.charge_external_id ? (conceptoDe.get(p.charge_external_id) ?? 'cuota') : 'sin cuota',
        devuelto, disponible: Math.round((Number(p.amount) - devuelto) * 100) / 100,
      }
    })

  return NextResponse.json({ student: st.student, cuotas, pagos: pagosDisponibles })
}

// POST { operation_id, allocations: [{charge_external_id, amount}] } → REPARTE el
// ingreso de Books entre una o varias cuotas (p. ej. un depósito que junta
// enrollment + tuition). Crea un pago serie BOOKS por cada porción. La suma no
// puede superar el monto del ingreso. Cuotas separadas: NO se unifican.
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const user = g.user
  const b = await req.json().catch(() => null) as {
    operation_id?: string
    allocations?: { charge_external_id?: string; amount?: number }[]
    refunds?: { payment_id?: string; amount?: number }[]
  } | null
  if (!b?.operation_id) return NextResponse.json({ error: 'Falta la operación' }, { status: 400 })
  const sb = db()

  const { data: op } = await sb.from('books_operations')
    .select('id, credit, debit, amount, txn_date, reference, contact_name, account_name, txn_type').eq('id', b.operation_id).maybeSingle()
  if (!op) return NextResponse.json({ error: 'Operación de Books no encontrada' }, { status: 404 })

  const { count: yaAsocPrev } = await sb.from('account_payments').select('id', { count: 'exact', head: true }).eq('books_operation_id', op.id)
  if ((yaAsocPrev ?? 0) > 0) return NextResponse.json({ error: 'Esta operación ya está asociada. Desasóciala primero para rehacerla.' }, { status: 409 })

  // ── DEVOLUCIÓN ────────────────────────────────────────────────────────────
  // Débito en Books = dinero que sale. Se asocia al PAGO que reversa, no a una
  // cuota: se registra como pago NEGATIVO que hereda la cuota del original, y
  // así el saldo revive solo (mismo patrón que los reembolsos de Flywire).
  const esDevolucion = Number(op.debit ?? 0) > 0
  if (esDevolucion) {
    const devs = (b.refunds ?? []).filter(r => r.payment_id && Number(r.amount) > 0)
    if (!devs.length) return NextResponse.json({ error: 'Elige a qué pago(s) corresponde la devolución' }, { status: 400 })
    const montoDev = Math.round(Number(op.debit) * 100) / 100
    const total = Math.round(devs.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100
    if (total > montoDev + 0.01) {
      return NextResponse.json({ error: `La suma a devolver (${total.toFixed(2)}) supera el monto de la devolución (${montoDev.toFixed(2)})` }, { status: 400 })
    }

    const ref = `Books devolución: ${op.reference || op.id.slice(0, 8)}${op.contact_name ? ` · ${op.contact_name}` : ''}`
    const fecha = op.txn_date || new Date().toISOString().slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas: any[] = []
    const estudiantes = new Set<string>()
    for (const d of devs) {
      const { data: pago } = await sb.from('account_payments')
        .select('id, student_id, amount, charge_external_id, series_code').eq('id', d.payment_id).maybeSingle()
      if (!pago) return NextResponse.json({ error: 'No se encontró el pago a devolver' }, { status: 404 })
      if (Number(pago.amount) <= 0) return NextResponse.json({ error: 'Solo se puede devolver sobre un pago positivo' }, { status: 400 })

      // No devolver más de lo que ese pago aún tiene sin devolver.
      const { data: previas } = await sb.from('account_payments')
        .select('amount').eq('refund_of_payment_id', pago.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yaDevuelto = ((previas ?? []) as any[]).reduce((s, p) => s + Math.abs(Number(p.amount ?? 0)), 0)
      const disponible = Math.round((Number(pago.amount) - yaDevuelto) * 100) / 100
      if (Number(d.amount) > disponible + 0.01) {
        return NextResponse.json({
          error: `Ese pago es de ${Number(pago.amount).toFixed(2)} y ya tiene ${yaDevuelto.toFixed(2)} devuelto: quedan ${disponible.toFixed(2)}.`,
        }, { status: 400 })
      }

      estudiantes.add(pago.student_id)
      filas.push({
        external_id: crypto.randomUUID(),
        charge_external_id: pago.charge_external_id,   // hereda la cuota: el saldo revive
        student_id: pago.student_id,
        amount: -Math.round(Number(d.amount) * 100) / 100,
        paid_date: fecha,
        series_code: 'BOOKS', transaction_reference: ref, payment_method: 'books',
        books_operation_id: op.id, refund_of_payment_id: pago.id,
      })
    }

    const { error: dErr } = await sb.from('account_payments').insert(filas)
    if (dErr) return NextResponse.json({ error: 'Error al registrar la devolución: ' + dErr.message }, { status: 500 })

    await sb.from('books_operations').update({
      gestion_status: 'asociada',
      associated_payment_id: devs[0].payment_id,
      gestion_note: `Devolución de ${total.toFixed(2)} sobre ${filas.length} pago(s)`,
      gestion_by: user.email ?? user.id, gestion_at: new Date().toISOString(),
    }).eq('id', op.id)

    // Devolver dinero puede dejar al estudiante en deuda vencida — y entonces
    // corresponde suspender su acceso a Moodle, no solo cuadrar el número.
    await refreshAccessForStudents(sb, [...estudiantes]).catch(() => null)
    return NextResponse.json({ ok: true, devolucion: true, pagos: filas.length, total })
  }

  // ── INGRESO ───────────────────────────────────────────────────────────────
  const allocs = (b.allocations ?? []).filter(a => a.charge_external_id && Number(a.amount) > 0)
  if (!allocs.length) return NextResponse.json({ error: 'Faltan las cuotas a asociar' }, { status: 400 })
  const monto = op.credit != null ? Number(op.credit) : Number(op.amount ?? 0)
  if (!(monto > 0)) return NextResponse.json({ error: 'La operación no tiene un monto de ingreso (crédito) válido' }, { status: 400 })

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
  await maybeMarkTramitePaid(r.charge_external_id).catch(() => null)
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
