import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const cycleId = req.nextUrl.searchParams.get('cycle_id')
  if (!cycleId) return NextResponse.json({ error: 'cycle_id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_dimensions')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('status', 'active')
    .order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_dimensions')
    .insert({
      cycle_id: body.cycle_id, code: body.code, name: body.name, description: body.description ?? null,
      valid_from_year: body.valid_from_year, status: 'active',
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
