import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) patch.status = body.status
  if (body.progress_pct !== undefined) patch.progress_pct = body.progress_pct
  if (body.notes !== undefined) patch.notes = body.notes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_action_responsibles').update(patch).eq('id', id)
    .select('id, role, assigned_from_year, assigned_to_year, status, progress_pct, notes, employee:hr_employees(id, full_name, position)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('strategic_action_responsibles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
