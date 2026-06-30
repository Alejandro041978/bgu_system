import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const strategyId = req.nextUrl.searchParams.get('strategy_id')
  if (!strategyId) return NextResponse.json({ error: 'strategy_id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_actions')
    .select('*, responsibles:strategic_action_responsibles(id, role, assigned_from_year, assigned_to_year, status, progress_pct, notes, employee:hr_employees(id, full_name, position))')
    .eq('strategy_id', strategyId)
    .eq('status', 'active')
    .order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_actions')
    .insert({
      strategy_id: body.strategy_id, code: body.code, name: body.name, description: body.description ?? null,
      start_year: body.start_year ?? null, target_close_year: body.target_close_year ?? null,
      valid_from_year: body.valid_from_year, status: 'active',
    })
    .select('*, responsibles:strategic_action_responsibles(id, role, assigned_from_year, assigned_to_year, status, progress_pct, notes, employee:hr_employees(id, full_name, position))')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
