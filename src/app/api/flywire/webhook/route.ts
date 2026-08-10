import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyFlywireSignature, FLYWIRE_PAID_STATUSES, desdeSubunidades } from '@/lib/flywire'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { refreshStudentAccess } from '@/lib/moodle-access'
import { aplicarGatillosDePago } from '@/lib/payment-gates'
import { observar } from '@/lib/api-observe'
import { emparejarPorDocumento } from '@/lib/flywire-match'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

// POST — Notificación de pago de Flywire (Notifications v2).
export async function POST(req: NextRequest) {
  await observar(req, '/api/flywire/webhook')

  const raw = await req.text()
  const digest = req.headers.get('x-flywire-digest')
  const firma = verifyFlywireSignature(raw, digest)
  const valid = firma.valid

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null
  try { body = JSON.parse(raw) } catch { /* cuerpo no-JSON */ }

  // ── El cuerpo REAL de Notifications v2 va anidado ─────────────────────────
  //
  //   { event_type, event_date, event_resource,
  //     data: { payment_id, status, amount_to, currency_to, external_reference,
  //             fields: { id_cuota, dni, student_id, ... } } }
  //
  // Leíamos el nivel superior, así que payment_id, status, importe y campos
  // salían vacíos SIEMPRE. La consecuencia no fue un error: era un 200 con
  // "sin external_reference" y ni un pago registrado. 222 notificaciones
  // reales entraron así entre el 9 y el 10 de agosto de 2026 —29 pagos por
  // 3.800,50 dólares— sin dejar más rastro que el log crudo.
  //
  // Se conserva la lectura del nivel superior como respaldo: si mañana Flywire
  // manda un cuerpo plano, sigue funcionando.
  //
  // Y hay un SEGUNDO formato, el del callback clásico (el que se activa
  // pasando callback_url al iniciar el pago):
  //
  //   { at, id, amount, status, callback_id }
  //
  // Plano, con `id` en vez de `payment_id`, importe en UNIDADES y sin los
  // campos del recipiente. Su firma no valida contra el shared secret, así que
  // no registra nada — pero se reconoce para que el log diga qué llegó en vez
  // de guardar una fila de nulos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = body?.data ?? body ?? {}
  const clasico = !body?.data && !!body?.id && !!body?.callback_id
  const paymentId = d?.payment_id ?? d?.id ?? body?.payment_id ?? null
  const status = String(d?.status ?? body?.status ?? body?.payment_status ?? '').toLowerCase()
  const eventType = body?.event_type ?? d?.event_type ?? null

  // Llave de conciliación: el external_id de la cuota.
  //
  // OJO con el orden. En el portal ZBL el campo `dni` tiene
  // internal_alias = external_reference, así que el `external_reference` que
  // manda Flywire es el DOCUMENTO del estudiante, no nuestra referencia de
  // cuota. Si lo leyéramos primero, buscaríamos la cuota por un documento, no
  // la encontraríamos nunca, y el webhook respondería 200 sin registrar el
  // pago: roto en silencio.
  //
  // La referencia real viaja en `id_cuota`, un campo oculto del portal que
  // Flywire publica en los callbacks (publish_recipient_info_within_callbacks),
  // y en `callback_id`. `external_reference` queda solo como último recurso.
  const recipientFields: Record<string, string> = {}
  const rawFields = d?.fields ?? body?.recipient_fields ?? body?.fields ?? null
  if (Array.isArray(rawFields)) {
    for (const f of rawFields) {
      const k = f?.id ?? f?.field_id ?? f?.name
      if (k) recipientFields[String(k)] = String(f?.value ?? '')
    }
  } else if (rawFields && typeof rawFields === 'object') {
    for (const [k, v] of Object.entries(rawFields)) recipientFields[k] = String(v ?? '')
  }
  const externalRef =
    recipientFields.id_cuota?.trim() ||
    d?.fields?.id_cuota ||
    d?.callback_id ||
    body?.callback_id ||
    d?.external_reference ||
    body?.external_reference ||
    null

  const sb = db()

  // 1) Log crudo (auditoría), siempre
  await sb.from('flywire_events').insert({
    payment_id: paymentId, external_reference: externalRef, status, event_type: eventType,
    amount_from: num(d?.amount_from), currency_from: d?.currency_from ?? null,
    // En el clásico el importe ya viene en unidades: se sube a subunidades
    // para que la columna signifique lo mismo en las dos formas.
    amount_to: clasico ? Math.round(Number(d?.amount ?? 0) * 100) : num(d?.amount_to),
    currency_to: d?.currency_to ?? null,
    signature_valid: valid, signature_key: firma.key, raw: body ?? { raw },
  })

  // 2) Firma inválida → no actuamos (Flywire reintentará)
  // Se responde 401 para que Flywire reintente. Si el problema fuera nuestro
  // —clave mal configurada— el reintento no arregla nada, pero al menos la
  // notificación no se da por entregada.
  if (!valid) {
    return NextResponse.json({
      error: 'Firma inválida', digest_recibido: !!digest,
      formato: clasico ? 'callback clásico (no es Notifications v2)' : 'notifications v2',
    }, { status: 401 })
  }
  // 2b) Pago de PRUEBA nacido del ERP en modo Demo.
  //
  // El portal Demo notifica a ESTE mismo webhook: el callback estático apunta
  // a system.blackwell.university y no distingue entornos. Sin esta puerta, un
  // pago de mentira contra una cuota real la dejaría pagada, que es justo lo
  // que hace inservible un entorno de pruebas.
  //
  // El evento se registra —para eso se prueba— y no se toca el estado de
  // cuenta de nadie.
  if (String(recipientFields.payment_source ?? '').toUpperCase() === 'ERP-DEMO') {
    return NextResponse.json({
      ok: true, prueba: true,
      note: 'pago de prueba (ERP-DEMO): queda en el log, sin efecto en el estado de cuenta',
    })
  }

  // 2c) Sin referencia de cuota: el pago viene del portal de Flywire.
  //
  // Si el documento del pagador corresponde a un estudiante nuestro, se coloca
  // en su cuota vencida más antigua — lo mismo que haría Cobranzas a mano. Si
  // no lo reconocemos (suele ser un postulante que aún no existe en el ERP),
  // se responde 200 y queda en la bandeja de sin conciliar: es una decisión de
  // Admisión, no un fallo.
  let refFinal: string | null = externalRef
  let notaEmparejado: string | null = null
  if (!refFinal && FLYWIRE_PAID_STATUSES.has(status)) {
    const m = await emparejarPorDocumento(sb, d?.fields, d?.fields?.student_email)
    if (m.ok && m.charge_external_id) { refFinal = m.charge_external_id; notaEmparejado = m.motivo }
    else return NextResponse.json({ ok: true, note: 'sin conciliar: ' + m.motivo })
  }
  if (!refFinal) return NextResponse.json({ ok: true, note: 'sin external_reference' })
  const externalRefFinal = refFinal

  // 3) Ubicar la cuota
  const { data: charge } = await sb.from('account_charges')
    .select('external_id, student_id, enrollment_id, convocatoria_id, amount')
    .eq('external_id', externalRefFinal).maybeSingle()
  if (!charge) return NextResponse.json({ ok: true, note: 'cuota no encontrada' })

  // Reflejar el estado Flywire en la cuota
  await sb.from('account_charges').update({ flywire_status: status, flywire_payment_id: paymentId })
    .eq('external_id', externalRefFinal)

  if (FLYWIRE_PAID_STATUSES.has(status) && paymentId) {
    // Idempotencia: no duplicar el pago si ya lo registramos
    const { data: exists } = await sb.from('account_payments')
      .select('id').eq('flywire_payment_id', paymentId).maybeSingle()
    if (!exists) {
      // Se registra LO QUE LLEGÓ, no lo que cabe en la cuota.
      //
      // Antes esto tomaba el saldo de la cuota e ignoraba el importe del aviso:
      // un giro de $400 contra una cuota de $150 entraba como $150 y los otros
      // $250 desaparecían del ERP. Y desaparecían callando, porque la cuota
      // quedaba Pagada y el estado de cuenta cuadraba consigo mismo.
      //
      // El excedente es legítimo y frecuente: el estudiante gira el total del
      // programa cuando lo único facturado es la matrícula. Queda como saldo a
      // favor sobre esa cuota y Cobranzas lo reparte a las cuotas que vayan
      // naciendo (botón "Distribuir excedente" del estado de cuenta).
      const { data: pays } = await sb.from('account_payments').select('amount').eq('charge_external_id', externalRefFinal)
      const paid = (pays ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0)
      const balance = Math.round((Number(charge.amount ?? 0) - paid) * 100) / 100
      // amount_to viene en SUBUNIDADES (40000 = 400.00 USD). En el log crudo se
      // guarda tal como llegó —es la auditoría— y aquí se convierte.
      const recibido = desdeSubunidades(num(d?.amount_to), d?.currency_to)
      const amount = recibido != null && recibido > 0 ? recibido
        : (balance > 0 ? balance : Number(charge.amount ?? 0))

      await sb.from('account_payments').insert({
        external_id: crypto.randomUUID(),
        charge_external_id: externalRefFinal,
        student_id: charge.student_id ?? null,
        amount,
        paid_date: new Date().toISOString().slice(0, 10),
        transaction_reference: [`Flywire ${paymentId}`, notaEmparejado ? `conciliado por documento (${notaEmparejado})` : null].filter(Boolean).join(String.fromCharCode(32,183,32)),
        flywire_payment_id: paymentId,
      })

      // Si este pago cubrió los conceptos iniciales, la matrícula se activa
      // sola (correo estudiantil, acta, carrusel y Moodle).
      try { await maybeActivateOnPayment(externalRefFinal) } catch { /* la importación/el botón Activar recuperan */ }
      // Documento, trámite o examen: los tres esperan a que el estudiante
      // pague, y los tres se olvidaban por aquí. Van juntos para que enganchar
      // uno no signifique olvidar los otros dos.
      try { await aplicarGatillosDePago(externalRefFinal) } catch { /* el barrido horario recupera */ }
      // Reactiva Moodle si el pago dejó al estudiante sin vencido
      if (charge.student_id) { try { await refreshStudentAccess(sb, charge.student_id) } catch { /* best-effort */ } }
    }
  } else if (status === 'reversed' && paymentId) {
    // Reverso → elimina el pago registrado de este payment_id
    await sb.from('account_payments').delete().eq('flywire_payment_id', paymentId)
    // El reverso puede DEJAR al estudiante en deuda → reconciliar (puede suspender)
    if (charge.student_id) { try { await refreshStudentAccess(sb, charge.student_id) } catch { /* best-effort */ } }
  }

  return NextResponse.json({ ok: true })
}
