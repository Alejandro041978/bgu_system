import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// PATCH { id, transaction_reference } → edita la referencia de un pago (staff).
export async function PATCH(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const ref = b?.transaction_reference?.toString().trim() || null
  const { error } = await db().from('account_payments')
    .update({ transaction_reference: ref }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { id } → borra un pago del estado de cuenta (staff). Se usa para quitar
// los pagos ficticios heredados de SystemActiva y reemplazarlos por Books/Flywire.
// Salvaguarda: si el pago provino de una asociación Books, desasocia la operación
// (vuelve a 'pendiente') para no dejar el ingreso de Books colgado.
export async function DELETE(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const b = await req.json().catch(() => null) as { id?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()

  // Si este pago fue una asociación de Books, libera la operación de Books
  const { data: op } = await sb.from('books_operations').select('id').eq('associated_payment_id', b.id).maybeSingle()
  if (op) {
    await sb.from('books_operations').update({
      gestion_status: 'pendiente', associated_charge_external_id: null, associated_payment_id: null,
      gestion_note: null, gestion_by: null, gestion_at: null,
    }).eq('id', op.id).then(() => null, () => null)
  }

  const { error } = await sb.from('account_payments').delete().eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, freed_books_operation: !!op })
}
