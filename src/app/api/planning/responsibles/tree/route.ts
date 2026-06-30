import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Devuelve todas las Acciones por Responsable de un ciclo, con el contexto completo
// (dimensión > objetivo > estrategia > acción). Se arma con queries separadas porque
// Supabase no resuelve bien los joins anidados de más de 2-3 niveles.
export async function GET(req: NextRequest) {
  const cycleId = req.nextUrl.searchParams.get('cycle_id')
  if (!cycleId) return NextResponse.json({ error: 'cycle_id requerido' }, { status: 400 })
  const supabase = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: dims } = await sb.from('strategic_dimensions').select('id, code, name').eq('cycle_id', cycleId).eq('status', 'active')
  const dimIds = (dims ?? []).map((d: { id: string }) => d.id)
  if (!dimIds.length) return NextResponse.json([])

  const { data: objs } = await sb.from('strategic_objectives').select('id, code, name, dimension_id').in('dimension_id', dimIds).eq('status', 'active')
  const objIds = (objs ?? []).map((o: { id: string }) => o.id)
  if (!objIds.length) return NextResponse.json([])

  const { data: strats } = await sb.from('strategic_strategies').select('id, code, name, objective_id').in('objective_id', objIds).eq('status', 'active')
  const stratIds = (strats ?? []).map((s: { id: string }) => s.id)
  if (!stratIds.length) return NextResponse.json([])

  const { data: actions } = await sb.from('strategic_actions').select('id, code, name, strategy_id').in('strategy_id', stratIds).eq('status', 'active')
  const actionIds = (actions ?? []).map((a: { id: string }) => a.id)
  if (!actionIds.length) return NextResponse.json([])

  const { data: responsibles } = await sb
    .from('strategic_action_responsibles')
    .select('id, code, name, assigned_from_year, action_id, employee:hr_employees(id, full_name, position)')
    .in('action_id', actionIds)

  const dimById = Object.fromEntries((dims ?? []).map((d: { id: string }) => [d.id, d]))
  const objById = Object.fromEntries((objs ?? []).map((o: { id: string }) => [o.id, o]))
  const stratById = Object.fromEntries((strats ?? []).map((s: { id: string }) => [s.id, s]))
  const actionById = Object.fromEntries((actions ?? []).map((a: { id: string }) => [a.id, a]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (responsibles ?? []).map((r: any) => {
    const action = actionById[r.action_id]
    const strat = action ? stratById[action.strategy_id] : null
    const obj = strat ? objById[strat.objective_id] : null
    const dim = obj ? dimById[obj.dimension_id] : null
    return {
      id: r.id, code: r.code, name: r.name, assigned_from_year: r.assigned_from_year, employee: r.employee,
      action: action ? { id: action.id, code: action.code, name: action.name } : null,
      strategy: strat ? { id: strat.id, code: strat.code, name: strat.name } : null,
      objective: obj ? { id: obj.id, code: obj.code, name: obj.name } : null,
      dimension: dim ? { id: dim.id, code: dim.code, name: dim.name } : null,
    }
  })

  return NextResponse.json(result)
}
