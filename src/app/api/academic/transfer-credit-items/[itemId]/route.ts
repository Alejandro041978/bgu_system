import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { reflectItem, unreflectItem } from '@/lib/transfer-credit-server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// PATCH → edita un ítem (típicamente la nota de origen) y recalcula la conversión
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { itemId } = await params
  const b = await req.json() as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of ['origin_course_name', 'dest_course_id', 'dest_course_name', 'origin_grade']) {
    if (k in b) patch[k] = b[k] === '' ? null : b[k]
  }
  const { error } = await db().from('transfer_credit_items').update(patch).eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const converted = await reflectItem(itemId)
  return NextResponse.json({ ok: true, converted_grade: converted })
}

// DELETE → elimina el ítem y su reflejo en notas
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { itemId } = await params
  await unreflectItem(itemId)
  const { error } = await db().from('transfer_credit_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
