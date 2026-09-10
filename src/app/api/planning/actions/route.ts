import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const strategyId = req.nextUrl.searchParams.get('strategy_id')
  if (!strategyId) return NextResponse.json({ error: 'strategy_id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_actions')
    .select('*, responsibles:strategic_action_responsibles(id, role, employee:hr_employees(id, full_name, position)), years:strategic_action_years(year)')
    .eq('strategy_id', strategyId)
    .eq('status', 'active')
    .order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_actions')
    .insert({
      strategy_id: body.strategy_id, code: body.code, name: body.name, description: body.description ?? null,
      start_year: body.start_year ?? null, target_close_year: body.target_close_year ?? null,
      valid_from_year: body.valid_from_year, status: 'active',
    })
    // (los años de ejecución se agregan abajo, tras conocer el id)
    .select('*, responsibles:strategic_action_responsibles(id, role, employee:hr_employees(id, full_name, position)), years:strategic_action_years(year)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const years = Array.isArray(body.years)
    ? [...new Set((body.years as number[]).filter(y => Number.isInteger(y) && y > 1900))]
    : []
  if (years.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db() as any).from('strategic_action_years').insert(years.map(y => ({ action_id: data.id, year: y })))
  }
  return NextResponse.json({ ...data, years: years.map(y => ({ year: y })) })
}
