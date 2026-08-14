import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPagina } from '@/lib/page-guard'
import { maybeActivateOnPayment } from '@/lib/enrollment-activation'
import { maybeMarkExamPaid } from '@/lib/exam-requests'
import { maybeMarkDocumentPaid } from '@/lib/document-request'
import { maybeMarkTramitePaid } from '@/lib/tramites'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Mover un pago de una cuota a otra.
//
// Faltaba, y el caso que lo pidió es de manual: un estudiante pide un reembolso
// por error y vuelve a abonar. El reembolso tarda en ejecutarse y el nuevo pago
// llega antes, así que se aplica a la cuota SIGUIENTE —la anterior aún constaba
// pagada—. Cuando el reembolso por fin entra, revive la deuda de la cuota vieja
// y el dinero se quedó en la que no era.
//
// `distribute` no sirve para esto: reparte el EXCEDENTE de una cuota, y aquí no
// sobra nada, el pago cubre exactamente la cuota equivocada. Y borrar y volver a
// crear el pago perdería la referencia de Flywire, con ella la idempotencia de
// la importación y la conciliación.
//
// Lo que se mueve es la asignación, no el hecho: el giro sigue teniendo su
// fecha, su importe y su referencia. Solo cambia a qué se aplica.
//
// POST { payment_id, charge_external_id }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Mover un pago cambia qué cuota queda saldada y cuál revive: es una decisión
  // de cobranza, no una consulta. Exige el permiso de edición sobre Estado de
  // Cuenta —hoy lo tienen collection_agent y admin— en vez de bastar con tener
  // sesión, que mientras el permisionador siga en modo auditoría significa
  // cualquier colaborador del ERP.
  const noAutorizado = await guardPagina('academic_account')
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as
    { payment_id?: string; charge_external_id?: string } | null
  if (!b?.payment_id || !b?.charge_external_id) {
    return NextResponse.json({ error: 'Faltan payment_id y charge_external_id' }, { status: 400 })
  }

  const sb = db()
  const { data: pago } = await sb.from('account_payments')
    .select('id, student_id, charge_external_id, amount, transaction_reference, flywire_payment_id, refund_of_payment_id')
    .eq('id', b.payment_id).maybeSingle()
  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if (pago.charge_external_id === b.charge_external_id) {
    return NextResponse.json({ error: 'El pago ya está en esa cuota' }, { status: 409 })
  }
  // Una devolución es la sombra de su pago: va donde vaya el original, y se
  // arrastra sola más abajo. Moverla por su cuenta descuadraría las dos cuotas.
  if (pago.refund_of_payment_id) {
    return NextResponse.json({ error: 'Una devolución no se mueve sola: mueve el pago que la originó y ella lo sigue.' }, { status: 409 })
  }

  const { data: destino } = await sb.from('account_charges')
    .select('external_id, student_id, amount, due_date').eq('external_id', b.charge_external_id).maybeSingle()
  if (!destino) return NextResponse.json({ error: 'La cuota de destino no existe' }, { status: 404 })
  if (String(destino.student_id) !== String(pago.student_id)) {
    return NextResponse.json({ error: 'Esa cuota es de otro estudiante' }, { status: 409 })
  }

  // No se apila dinero sobre una cuota ya saldada: eso crea un excedente que
  // luego hay que repartir, y el error se propaga en vez de arreglarse.
  const { data: yaEn } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', b.charge_external_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagadoDestino = ((yaEn ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const saldoDestino = r2(Number(destino.amount ?? 0) - pagadoDestino)
  if (saldoDestino <= 0.005) {
    return NextResponse.json({ error: 'Esa cuota ya está saldada: no hace falta mover nada ahí.' }, { status: 409 })
  }

  const { error } = await sb.from('account_payments')
    .update({ charge_external_id: b.charge_external_id }).eq('id', pago.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sus reembolsos viajan con él. El reembolso es la sombra del pago: si se
  // quedara en la cuota vieja, esa cuota saldría con saldo negativo y la nueva
  // cobraría de más.
  let reembolsosMovidos = 0
  if (pago.flywire_payment_id) {
    const { data } = await sb.from('account_payments')
      .update({ charge_external_id: b.charge_external_id })
      .ilike('transaction_reference', `%(reembolso de ${pago.flywire_payment_id})%`).select('id')
    reembolsosMovidos = (data ?? []).length
  }

  // Los mismos gates que al conciliar: la cuota de destino puede ser la que
  // activa una matrícula, o el cargo de un examen o un trámite.
  const activada = await maybeActivateOnPayment(b.charge_external_id).catch(() => null)
  await maybeMarkExamPaid(b.charge_external_id).catch(() => null)
  await maybeMarkDocumentPaid(b.charge_external_id).catch(() => null)
  await maybeMarkTramitePaid(b.charge_external_id).catch(() => null)

  return NextResponse.json({
    ok: true,
    desde: pago.charge_external_id,
    hacia: b.charge_external_id,
    monto: Number(pago.amount ?? 0),
    reembolsos_movidos: reembolsosMovidos,
    matricula_activada: activada?.ok ?? false,
  })
}
