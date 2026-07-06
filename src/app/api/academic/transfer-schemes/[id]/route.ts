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

// GET → esquema + ítems
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()
  const { data: scheme } = await sb.from('transfer_schemes').select('*').eq('id', id).maybeSingle()
  if (!scheme) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const { data: items } = await sb.from('transfer_scheme_items').select('*').eq('scheme_id', id).order('id')
  // ¿a cuántos estudiantes ya se aplicó?
  const { count } = await sb.from('transfer_credits').select('id', { count: 'exact', head: true }).eq('scheme_id', id)
  return NextResponse.json({ scheme, items: items ?? [], applied_count: count ?? 0 })
}

// DELETE → elimina el esquema (no borra las convalidaciones ya generadas)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const { error } = await db().from('transfer_schemes').delete().eq('id', id)  // cascade borra scheme_items
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
