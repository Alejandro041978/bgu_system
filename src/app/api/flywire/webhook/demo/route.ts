import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyFlywireSignature } from '@/lib/flywire'
import { observar } from '@/lib/api-observe'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

// POST — Notificación del entorno DEMO de Flywire.
//
// Es el mismo formato que el webhook de Producción y valida con las mismas
// claves; la única diferencia es que aquí no se toca nada. Se registra el aviso
// y se responde 200.
//
// La separación es por URL a propósito. El cuerpo de la notificación no dice de
// qué entorno viene —mismo recipiente ZBL, mismo formato de payment_id, misma
// firma— así que dentro de un solo webhook no hay forma honesta de distinguir
// una prueba de un cobro. Y el modo de fallo no es teórico: sin id_cuota el
// webhook de Producción empareja por documento, de modo que un pago de mentira
// hecho con el documento de un estudiante real le dejaría una cuota pagada, le
// activaría la matrícula y le devolvería el acceso a Moodle.
//
// El único filtro que había —payment_source = ERP-DEMO— solo cubre los pagos
// que nacen del ERP con el modo Demo puesto. Un pago hecho a mano en
// payment.demo.flywire.com no lleva ese campo, y ese es justo el que sirve para
// probar la integración.
export async function POST(req: NextRequest) {
  await observar(req, '/api/flywire/webhook/demo')

  const raw = await req.text()
  const firma = verifyFlywireSignature(raw, req.headers.get('x-flywire-digest'))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null
  try { body = JSON.parse(raw) } catch { /* cuerpo no-JSON */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = body?.data ?? body ?? {}
  const clasico = !body?.data && !!body?.id && !!body?.callback_id

  await db().from('flywire_events_demo').insert({
    payment_id: d?.payment_id ?? d?.id ?? null,
    external_reference: d?.callback_id ?? body?.callback_id ?? d?.external_reference ?? null,
    status: String(d?.status ?? '').toLowerCase(),
    event_type: body?.event_type ?? d?.event_type ?? null,
    amount_from: num(d?.amount_from), currency_from: d?.currency_from ?? null,
    amount_to: clasico ? Math.round(Number(d?.amount ?? 0) * 100) : num(d?.amount_to),
    currency_to: d?.currency_to ?? null,
    signature_valid: firma.valid, signature_key: firma.key, raw: body ?? { raw },
  })

  // Se responde 200 aunque la firma no valide: en Demo lo que interesa es ver
  // QUÉ llega. Si se respondiera 401, Flywire reintentaría y el problema real
  // —una clave distinta en Demo— quedaría escondido detrás de los reintentos.
  return NextResponse.json({
    ok: true, entorno: 'demo', firma_valida: firma.valid, firma: firma.key,
    formato: clasico ? 'callback clásico' : 'notifications v2',
  })
}

// GET — para comprobar de un vistazo qué ha llegado al buzón de pruebas.
export async function GET() {
  const { data } = await db().from('flywire_events_demo')
    .select('received_at, payment_id, status, event_type, amount_to, currency_to, signature_valid, signature_key')
    .order('received_at', { ascending: false }).limit(25)
  return NextResponse.json({ ok: true, entorno: 'demo', eventos: data ?? [] })
}
