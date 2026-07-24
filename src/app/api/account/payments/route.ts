import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// PATCH { id, transaction_reference } → edita la referencia de un pago
export async function PATCH(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const ref = b?.transaction_reference?.toString().trim() || null
  const { error } = await db().from('account_payments')
    .update({ transaction_reference: ref }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
