import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isSuperadmin, isStudentUser } from '@/lib/student-identity'
import { FLYWIRE_PAID_STATUSES, desdeSubunidades } from '@/lib/flywire'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { aplicarGatillosDePago } from '@/lib/payment-gates'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Reprocesar las notificaciones que ya llegaron y no se registraron.
//
// El webhook leía el nivel superior del cuerpo cuando el payload viene anidado
// bajo `data`, así que respondía 200 y no hacía nada. Todo lo que entró está
// guardado íntegro en flywire_events.raw — el log crudo era lo único que
// funcionaba — y de ahí se puede rehacer sin pedirle nada a Flywire.
//
// Idempotente por flywire_payment_id: correrlo dos veces no duplica un pago.
//
// Por omisión SOLO reprocesa lo que llegó con firma válida. Las de firma
// inválida son anteriores a que el secreto estuviera puesto: son casi con
// seguridad legítimas, pero el endpoint es público y nadie las autenticó, así
// que incluirlas es una decisión que se toma a mano (?incluir_sin_firma=1) y
// quedan marcadas para que Finanzas las contraste.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!(await isSuperadmin(user.id))) {
    return NextResponse.json({ error: 'Solo el superadministrador puede reprocesar pagos' }, { status: 403 })
  }

  const aplicar = req.nextUrl.searchParams.get('apply') === '1'
  const incluirSinFirma = req.nextUrl.searchParams.get('incluir_sin_firma') === '1'
  const sb = db()

  const { data: eventos } = await sb.from('flywire_events')
    .select('raw, signature_valid, received_at')
    .not('signature_valid', 'is', null).order('received_at')

  // Un pago genera varias notificaciones (initiated → guaranteed → processed).
  // Se queda la más avanzada: la que trae el estado de cobrado.
  const porPago = new Map<string, { ref: string | null; monto: number | null; moneda: string | null; estado: string; firma: boolean; fecha: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (eventos ?? []) as any[]) {
    const d = e.raw?.data ?? e.raw ?? {}
    const pid = d?.payment_id
    if (!pid) continue
    const estado = String(d?.status ?? '').toLowerCase()
    const prev = porPago.get(String(pid))
    const cobrado = FLYWIRE_PAID_STATUSES.has(estado)
    if (prev && !cobrado) { prev.firma = prev.firma || !!e.signature_valid; continue }
    porPago.set(String(pid), {
      ref: (d?.fields?.id_cuota || d?.external_reference || null) || null,
      monto: d?.amount_to != null ? Number(d.amount_to) : null,
      moneda: d?.currency_to ?? null,
      estado, firma: (prev?.firma ?? false) || !!e.signature_valid,
      fecha: String(e.received_at ?? '').slice(0, 10),
    })
  }

  const detalle: { payment_id: string; importe: number | null; motivo: string }[] = []
  let creados = 0

  for (const [pid, p] of porPago) {
    if (!FLYWIRE_PAID_STATUSES.has(p.estado)) continue
    if (!p.firma && !incluirSinFirma) { detalle.push({ payment_id: pid, importe: null, motivo: 'llegó sin firma válida (anterior al secreto)' }); continue }
    if (!p.ref) { detalle.push({ payment_id: pid, importe: null, motivo: 'sin id_cuota: pago hecho desde el portal de Flywire' }); continue }

    const { data: charge } = await sb.from('account_charges')
      .select('external_id, student_id, amount').eq('external_id', p.ref).maybeSingle()
    if (!charge) { detalle.push({ payment_id: pid, importe: null, motivo: 'la cuota referida ya no existe' }); continue }

    const { data: existe } = await sb.from('account_payments')
      .select('id').eq('flywire_payment_id', pid).maybeSingle()
    if (existe) { detalle.push({ payment_id: pid, importe: null, motivo: 'ya estaba registrado' }); continue }

    const importe = desdeSubunidades(p.monto, p.moneda) ?? Number(charge.amount ?? 0)
    detalle.push({ payment_id: pid, importe, motivo: aplicar ? 'registrado' : 'se registraría' })
    if (!aplicar) continue

    const { error } = await sb.from('account_payments').insert({
      external_id: crypto.randomUUID(),
      charge_external_id: p.ref,
      student_id: charge.student_id ?? null,
      amount: importe,
      // La fecha del aviso, no la de hoy: el pago ocurrió cuando ocurrió.
      paid_date: p.fecha,
      transaction_reference: `Flywire ${pid}${p.firma ? '' : ' (sin firma)'}`,
      flywire_payment_id: pid,
    })
    if (error) { detalle[detalle.length - 1].motivo = 'error: ' + error.message; continue }
    creados++
    await sb.from('account_charges').update({ flywire_status: p.estado, flywire_payment_id: pid }).eq('external_id', p.ref)
    // Los mismos gatillos que habría disparado el webhook en su momento.
    try { await maybeActivateOnPayment(p.ref) } catch { /* recuperable */ }
    try { await aplicarGatillosDePago(p.ref) } catch { /* el barrido horario recupera */ }
  }

  const aRegistrar = detalle.filter(x => x.motivo === 'se registraría' || x.motivo === 'registrado')
  return NextResponse.json({
    simulacro: !aplicar,
    notificaciones: (eventos ?? []).length,
    pagos_distintos: porPago.size,
    a_registrar: aRegistrar.length,
    importe_total: Math.round(aRegistrar.reduce((s, x) => s + Number(x.importe ?? 0), 0) * 100) / 100,
    registrados: creados,
    detalle,
  })
}
