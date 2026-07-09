import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function ok() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return !!user
}

// POST { offering_id } → asignar la oferta a este grupo (set group_id)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ok())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => null)
  if (!b?.offering_id) return NextResponse.json({ error: 'Falta offering_id' }, { status: 400 })
  const { error } = await db().from('semester_offerings').update({ group_id: id }).eq('id', b.offering_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?offering_id= → quitar la oferta del grupo (group_id null)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ok())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const offeringId = req.nextUrl.searchParams.get('offering_id')
  if (!offeringId) return NextResponse.json({ error: 'Falta offering_id' }, { status: 400 })
  const { error } = await db().from('semester_offerings').update({ group_id: null }).eq('id', offeringId).eq('group_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
