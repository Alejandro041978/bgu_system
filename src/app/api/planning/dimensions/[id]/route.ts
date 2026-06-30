import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// PATCH = crear nueva versión (revisión). Body: { name, description, valid_from_year, change_reason }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = db()

  if (!body.revise) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('strategic_dimensions').update({ code: body.code }).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prev, error: prevErr } = await (supabase as any)
    .from('strategic_dimensions').select('*').eq('id', id).single()
  if (prevErr || !prev) return NextResponse.json({ error: prevErr?.message ?? 'No encontrado' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: next, error: insErr } = await (supabase as any)
    .from('strategic_dimensions')
    .insert({
      cycle_id: prev.cycle_id, code: prev.code,
      name: body.name ?? prev.name, description: body.description ?? prev.description,
      valid_from_year: body.valid_from_year ?? prev.valid_from_year,
      supersedes_id: prev.id, status: 'active', change_reason: body.change_reason ?? null,
    })
    .select().single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await (supabase as any).from('strategic_dimensions')
    .update({ status: 'superseded', valid_to_year: body.valid_from_year ?? prev.valid_from_year })
    .eq('id', prev.id)

  return NextResponse.json(next)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('strategic_dimensions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
