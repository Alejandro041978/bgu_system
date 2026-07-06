import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// DELETE → elimina un mapeo del esquema
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { itemId } = await params
  const { error } = await db().from('transfer_scheme_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
