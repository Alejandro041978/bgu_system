import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { emitDocument } from '@/lib/document-emit'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// PATCH → acciones sobre una solicitud: pay | stage | emit
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: type } = await sb.from('document_types').select('stages, is_final_degree').eq('id', r.document_type_id).maybeSingle()
  const stagesCount = (type?.stages ?? []).length

  if (action === 'pay') {
    if (r.paid) return NextResponse.json({ error: 'Ya está pagada' }, { status: 400 })
    // Registra el pago del cargo asociado (si existe) para reflejarlo en el estado de cuenta.
    if (r.charge_external_id) {
      const { data: ch } = await sb.from('account_charges').select('amount, student_id').eq('external_id', r.charge_external_id).maybeSingle()
      if (ch) {
        await sb.from('account_payments').insert({
          external_id: crypto.randomUUID(), charge_external_id: r.charge_external_id,
          student_id: ch.student_id, amount: ch.amount, paid_date: new Date().toISOString().slice(0, 10),
          transaction_reference: `Solicitud ${String(id).slice(0, 8).toUpperCase()}`,
        })
      }
    }
    const status = stagesCount > 0 ? 'in_progress' : 'ready'
    const { error } = await sb.from('document_requests').update({ paid: true, status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Título final pagado → nace su expediente en la Hoja de Control de
    // Degrees (código correlativo + datos de entrega precargados del perfil).
    if (type?.is_final_degree && r.student_id) {
      try {
        const { data: existe } = await sb.from('degree_files')
          .select('id').eq('student_id', r.student_id).eq('program_id', r.program_id ?? null).maybeSingle()
        if (!existe) {
          const { data: stu } = await sb.from('academic_students')
            .select('first_name, last_name, second_last_name, phone_number, city, country').eq('id', r.student_id).maybeSingle()
          const { data: last } = await sb.from('degree_files')
            .select('doc_code').not('doc_code', 'is', null).order('doc_code', { ascending: false }).limit(1).maybeSingle()
          await sb.from('degree_files').insert({
            student_id: r.student_id, program_id: r.program_id ?? null, document_request_id: id,
            doc_code: String((Number(last?.doc_code ?? 0) || 0) + 1).padStart(6, '0'),
            receiver_name: stu ? [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ') : null,
            receiver_phone: stu?.phone_number ?? null, receiver_city: stu?.city ?? null, receiver_country: stu?.country ?? null,
          })
        }
      } catch { /* la Hoja puede crearse a mano si esto falla */ }
    }
    return NextResponse.json({ ok: true, status })
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
