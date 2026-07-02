import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('effectiveness_kpis')
    .select('id, code, level, name, formula, scope, frequency, value_type, formula_type, created_at')
    .order('code', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    code: string; level: string; name: string;
    formula?: string; scope?: string; frequency: string; value_type: string; formula_type?: string
  }
  if (!body.code || !body.level || !body.name || !body.frequency || !body.value_type) {
    return NextResponse.json({ error: 'code, level, name, frequency y value_type son requeridos' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('effectiveness_kpis')
    .insert({ code: body.code, level: body.level, name: body.name, formula: body.formula ?? null, scope: body.scope ?? null, frequency: body.frequency, value_type: body.value_type, formula_type: body.formula_type ?? null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id: string; formula_type?: string | null }
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any)
    .from('effectiveness_kpis')
    .update({ formula_type: body.formula_type ?? null })
    .eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('effectiveness_kpis').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
