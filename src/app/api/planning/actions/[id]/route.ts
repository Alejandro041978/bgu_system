import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const SELECT = '*, responsibles:strategic_action_responsibles(id, role, assigned_from_year, assigned_to_year, employee:hr_employees(id, full_name, position))'

// PATCH simple = ajustar estado/avance sin versionar (ej. progress_pct, status: completed/at_risk/overdue)
// Para cambios de redacción (name/description/valid_from_year/strategy) usar PATCH con revise=true
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = db()

  if (!body.revise) {
    const patch: Record<string, unknown> = {}
    if (body.progress_pct !== undefined) patch.progress_pct = body.progress_pct
    if (body.status !== undefined) patch.status = body.status
    if (body.start_year !== undefined) patch.start_year = body.start_year
    if (body.target_close_year !== undefined) patch.target_close_year = body.target_close_year
    if (body.code !== undefined) patch.code = body.code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('strategic_actions').update(patch).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prev, error: prevErr } = await (supabase as any)
    .from('strategic_actions').select('*').eq('id', id).single()
  if (prevErr || !prev) return NextResponse.json({ error: prevErr?.message ?? 'No encontrado' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: next, error: insErr } = await (supabase as any)
    .from('strategic_actions')
    .insert({
      strategy_id: prev.strategy_id, code: prev.code,
      name: body.name ?? prev.name, description: body.description ?? prev.description,
      start_year: body.start_year ?? prev.start_year, target_close_year: body.target_close_year ?? prev.target_close_year,
      progress_pct: prev.progress_pct,
      valid_from_year: body.valid_from_year ?? prev.valid_from_year,
      supersedes_id: prev.id, status: 'active', change_reason: body.change_reason ?? null,
    })
    .select(SELECT).single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await (supabase as any).from('strategic_actions')
    .update({ status: 'superseded', valid_to_year: body.valid_from_year ?? prev.valid_from_year })
    .eq('id', prev.id)

  return NextResponse.json(next)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('strategic_actions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
