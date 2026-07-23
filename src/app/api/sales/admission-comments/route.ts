import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST { enrollment_id, body } → agrega un comentario a la venta
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.enrollment_id || !b?.body?.trim()) return NextResponse.json({ error: 'Faltan enrollment_id y body' }, { status: 400 })

  const sb = db()
  const { data: emp } = await sb.from('hr_employees').select('full_name').eq('user_id', user.id).maybeSingle()
  const { error } = await sb.from('admission_sale_comments').insert({
    enrollment_id: b.enrollment_id, body: b.body.trim().slice(0, 2000),
    author_id: user.id, author_name: emp?.full_name ?? user.email ?? 'Colaborador',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → solo el autor puede borrar su comentario
export async function DELETE(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { data: c } = await sb.from('admission_sale_comments').select('author_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })
  if (c.author_id !== user.id) return NextResponse.json({ error: 'Solo el autor puede borrar su comentario' }, { status: 403 })
  const { error } = await sb.from('admission_sale_comments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
