import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { maybeMarkDocumentPaid } from '@/lib/document-request'
import { maybeMarkExamPaid } from '@/lib/exam-requests'
import { maybeMarkTramitePaid } from '@/lib/tramites'
import { refreshStudentAccess } from '@/lib/moodle-access'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const r2 = (n: number) => Math.round(n * 100) / 100

// Distribuir el excedente de una cuota a otras cuotas del mismo estudiante.
//
// El estudiante gira el total del programa cuando lo único facturado es la
// matrícula: el pago entra entero sobre esa cuota y deja saldo a favor. Después,
// según van naciendo las cuotas —la primera de tuition, más tarde el cargo del
// certificado—, Cobranzas reparte ese saldo a mano.
//
// No es una corrección de un error: es cómo opera el cobro. Un giro es un
// hecho —una fecha, una referencia, un importe— y la distribución solo dice a
// qué se aplica ese dinero. Por eso los trozos NO son pagos nuevos: se
// descuentan del pago de origen y heredan su referencia y su fecha, de modo que
// la suma por referencia de Flywire sigue cuadrando con lo que Flywire dice que
// mandó. Un pago de $400 puede acabar en cuatro filas, pero siguen sumando $400
// y siguen siendo el mismo giro.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as {
    payment_id?: string
    allocations?: { charge_external_id: string; amount: number }[]
  } | null
  if (!b?.payment_id) return NextResponse.json({ error: 'Falta payment_id' }, { status: 400 })
  const asignaciones = (b.allocations ?? []).filter(a => a?.charge_external_id && Number(a.amount) > 0)
  if (!asignaciones.length) return NextResponse.json({ error: 'No hay nada que distribuir' }, { status: 400 })

  const sb = db()

  const { data: pago } = await sb.from('account_payments')
    .select('id, student_id, charge_external_id, amount, paid_date, transaction_reference, series_code, ' +
      'flywire_payment_id, payment_method, currency_from, country_from, books_operation_id, refund_of_payment_id')
    .eq('id', b.payment_id).maybeSingle()
  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if (!pago.charge_external_id) {
    return NextResponse.json({ error: 'Este pago no está asociado a ninguna cuota: asócialo primero desde Pagos por conciliar' }, { status: 409 })
  }
  if (pago.refund_of_payment_id) {
    return NextResponse.json({ error: 'Una devolución no se distribuye' }, { status: 409 })
  }

  // ── Cuánto hay realmente de sobra ────────────────────────────────────────
  // El excedente es de la CUOTA, no del pago: puede haber varios pagos sobre
  // ella. Pero solo se puede mover dinero de ESTE pago, así que el tope es el
  // menor de los dos. Sin esto, dos distribuciones seguidas sobre la misma
  // cuota repartirían el mismo excedente dos veces.
  const { data: cuota } = await sb.from('account_charges')
    .select('external_id, student_id, amount').eq('external_id', pago.charge_external_id).maybeSingle()
  if (!cuota) return NextResponse.json({ error: 'La cuota del pago no existe' }, { status: 404 })

  const { data: sobreCuota } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', pago.charge_external_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagadoCuota = ((sobreCuota ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const excedente = r2(pagadoCuota - Number(cuota.amount ?? 0))
  const disponible = r2(Math.min(excedente, Number(pago.amount ?? 0)))
  if (disponible <= 0.005) {
    return NextResponse.json({ error: 'Esta cuota no tiene excedente que distribuir' }, { status: 409 })
  }

  const total = r2(asignaciones.reduce((s, a) => s + Number(a.amount), 0))
  if (total > disponible + 0.005) {
    return NextResponse.json({ error: `Estás repartiendo $${total.toFixed(2)} y solo hay $${disponible.toFixed(2)} de excedente` }, { status: 400 })
  }

  // ── Las cuotas destino ───────────────────────────────────────────────────
  const destinos = asignaciones.map(a => a.charge_external_id)
  if (destinos.includes(pago.charge_external_id)) {
    return NextResponse.json({ error: 'No se puede distribuir una cuota sobre sí misma' }, { status: 400 })
  }
  const { data: cuotasDestino } = await sb.from('account_charges')
    .select('external_id, student_id, amount').in('external_id', destinos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porId = new Map(((cuotasDestino ?? []) as any[]).map(c => [c.external_id, c]))
  if (porId.size !== new Set(destinos).size) {
    return NextResponse.json({ error: 'Alguna cuota de destino no existe' }, { status: 404 })
  }
  // El dinero de un estudiante no se mueve a la cuota de otro. Nunca.
  for (const c of porId.values()) {
    if (c.student_id !== cuota.student_id) {
      return NextResponse.json({ error: 'Hay cuotas de otro estudiante en la distribución' }, { status: 400 })
    }
  }

  // Nadie recibe más de lo que debe: el excedente se mueve, no se multiplica.
  const { data: pagosDestino } = await sb.from('account_payments')
    .select('charge_external_id, amount').in('charge_external_id', destinos)
  const pagadoPorDestino = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of ((pagosDestino ?? []) as any[])) {
    pagadoPorDestino.set(p.charge_external_id, (pagadoPorDestino.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
  }
  for (const a of asignaciones) {
    const c = porId.get(a.charge_external_id)!
    const saldo = r2(Number(c.amount ?? 0) - (pagadoPorDestino.get(a.charge_external_id) ?? 0))
    if (Number(a.amount) > saldo + 0.005) {
      return NextResponse.json({ error: `Una cuota recibe $${Number(a.amount).toFixed(2)} y solo debe $${saldo.toFixed(2)}` }, { status: 400 })
    }
  }

  // ── Mover ────────────────────────────────────────────────────────────────
  // Primero se descuenta del origen y después se reparte. En el orden inverso,
  // un fallo a media escritura dejaría el dinero duplicado en el estado de
  // cuenta; así, como mucho, se queda sin repartir y se vuelve a intentar.
  const { error: eBaja } = await sb.from('account_payments')
    .update({ amount: r2(Number(pago.amount) - total) }).eq('id', pago.id)
  if (eBaja) return NextResponse.json({ error: eBaja.message }, { status: 500 })

  const filas = asignaciones.map(a => ({
    external_id: crypto.randomUUID(),
    charge_external_id: a.charge_external_id,
    student_id: pago.student_id,
    amount: r2(Number(a.amount)),
    paid_date: pago.paid_date,
    // Misma referencia y misma fecha: es el mismo giro, aplicado a otra cuota.
    transaction_reference: pago.transaction_reference,
    // Pero NO el flywire_payment_id. Ese identifica al giro ante Flywire y solo
    // puede llevarlo una fila —la base tiene un índice único sobre él—: la del
    // pago de origen, que es la que lo encarna. Un abono no es un giro nuevo,
    // así que no compite por esa identidad.
    distributed_from_payment_id: pago.id,
    series_code: pago.series_code,
    payment_method: pago.payment_method,
    currency_from: pago.currency_from,
    country_from: pago.country_from,
  }))
  const { error: eAlta } = await sb.from('account_payments').insert(filas)
  if (eAlta) {
    // Devolver el dinero al origen: es preferible dejarlo como estaba a
    // dejarlo a medias.
    await sb.from('account_payments').update({ amount: Number(pago.amount) }).eq('id', pago.id).then(() => null, () => null)
    return NextResponse.json({ error: eAlta.message }, { status: 500 })
  }

  // ── Lo que el dinero desencadena ─────────────────────────────────────────
  // Una cuota saldada por distribución vale igual que una saldada por giro:
  // activa la matrícula, avanza la solicitud de documento, devuelve el campus.
  const efectos: string[] = []
  for (const a of asignaciones) {
    await sb.from('account_charges').update({
      flywire_status: pago.flywire_payment_id ? 'delivered' : null,
      flywire_payment_id: pago.flywire_payment_id,
    }).eq('external_id', a.charge_external_id).then(() => null, () => null)

    try { const act = await maybeActivateOnPayment(a.charge_external_id); if (act?.ok) efectos.push('matrícula activada') } catch { /* el botón Activar recupera */ }
    try { if (await maybeMarkExamPaid(a.charge_external_id)) efectos.push('examen a Hoja de Control') } catch { /* Registros lo recupera */ }
    try { if (await maybeMarkDocumentPaid(a.charge_external_id)) efectos.push('solicitud de documento avanzada') } catch { /* el barrido horario recupera */ }
    try { if (await maybeMarkTramitePaid(a.charge_external_id)) efectos.push('trámite avanzado') } catch { /* Registros lo recupera */ }
  }
  if (cuota.student_id) { try { await refreshStudentAccess(sb, cuota.student_id) } catch { /* best-effort */ } }

  return NextResponse.json({
    ok: true, distribuido: total, restante: r2(disponible - total), cuotas: asignaciones.length, efectos,
  })
}
