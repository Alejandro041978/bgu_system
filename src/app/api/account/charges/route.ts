import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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
  return NextResponse.json({ ok: true })
}
