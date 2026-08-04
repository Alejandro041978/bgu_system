import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { emitDocument } from '@/lib/document-emit'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// PATCH → acciones sobre una solicitud: pay | stage | emit
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const b = await req.json().catch(() => null)
  const action = b?.action as string
  const sb = db()

  const { data: r } = await sb.from('document_requests')
    .select('id, status, paid, stage_index, field_values, charge_external_id, document_type_id, student_id, program_id')
    .eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  const { data: type } = await sb.from('document_types').select('stages, is_final_degree, isic_card').eq('id', r.document_type_id).maybeSingle()
  const stagesCount = (type?.stages ?? []).length

  // El pago NO se registra manualmente: llega solo por importación de Flywire
  // (pagos-conciliar → maybeMarkDocumentPaid avanza la solicitud automáticamente).
  if (action === 'pay') {
    return NextResponse.json({ error: 'El pago no se registra manualmente: se concilia al importar Flywire' }, { status: 400 })
  }

  if (action === 'stage') {
    const merged = { ...(r.field_values ?? {}), ...(b?.field_values ?? {}) }
    const newIndex = Math.min((r.stage_index ?? 0) + 1, stagesCount)
    const status = newIndex >= stagesCount ? 'ready' : 'in_progress'
    const { error } = await sb.from('document_requests').update({
      field_values: merged, stage_index: newIndex, status, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status, stage_index: newIndex })
  }

  if (action === 'emit') {
    // El carné ISIC no se genera como PDF: se da de alta en la CCDB de ISIC.
    // Mismo botón, distinto emisor. Reintentar es seguro (es idempotente y no
    // consume una licencia por intento).
    if (type?.isic_card) {
      const { issueIsicCard } = await import('@/lib/isic-issue')
      const res = await issueIsicCard(id)
      if (!res.ok) return NextResponse.json({ error: res.error, missing: res.missing }, { status: 400 })
      return NextResponse.json({ ok: true, status: 'delivered', card_number: res.cardNumber, document_url: res.registrationUrl })
    }
    const res = await emitDocument(id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, status: 'delivered', document_url: res.url })
  }

  // Anular la solicitud: borra también su cuota si sigue impaga (una cuota
  // con pagos no se toca — habría que resolver el pago primero).
  if (action === 'cancel') {
    if (r.status === 'delivered') return NextResponse.json({ error: 'La solicitud ya fue entregada: no se puede anular' }, { status: 400 })
    let cuota_borrada = false
    if (r.charge_external_id) {
      const { count } = await sb.from('account_payments')
        .select('id', { count: 'exact', head: true }).eq('charge_external_id', r.charge_external_id)
      if ((count ?? 0) > 0) {
        return NextResponse.json({ error: 'La cuota de esta solicitud ya tiene pagos: desenlázalos o registra el reembolso antes de anular' }, { status: 409 })
      }
      await sb.from('account_charges').delete().eq('external_id', r.charge_external_id)
      cuota_borrada = true
    }
    const { error } = await sb.from('document_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'cancelled', cuota_borrada })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
