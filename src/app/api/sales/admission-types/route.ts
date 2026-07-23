import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// POST { category_id, name, commission } → crea un tipo de admisión
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.category_id || !b?.name?.trim()) return NextResponse.json({ error: 'Faltan categoría o nombre' }, { status: 400 })
  const { error } = await db().from('admission_types').insert({
    category_id: b.category_id, name: b.name.trim(), commission: Number(b.commission) || 0,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { id, name?, commission?, active? } — cambiar la comisión NO toca las
// ventas ya asignadas (llevan su snapshot); rige para las asignaciones nuevas.
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.name?.trim()) patch.name = b.name.trim()
  if (b.commission != null) patch.commission = Number(b.commission) || 0
  if (b.active != null) patch.active = !!b.active
  const { error } = await db().from('admission_types').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → solo si ningún registro de venta lo usa
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { count } = await sb.from('admission_sales').select('id', { count: 'exact', head: true }).eq('admission_type_id', id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: `Este tipo tiene ${count} venta(s) asignada(s): desactívalo en vez de borrarlo` }, { status: 409 })
  const { error } = await sb.from('admission_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
