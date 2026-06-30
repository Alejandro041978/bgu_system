import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function avg(nums: number[]) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// Rollup de avance por Dimensión > Objetivo > Estrategia > Acción para un año dado,
// calculado a partir de los reportes anuales de cada Acción por Responsable.
export async function GET(req: NextRequest) {
  const cycleId = req.nextUrl.searchParams.get('cycle_id')
  const year = req.nextUrl.searchParams.get('year')
  if (!cycleId || !year) return NextResponse.json({ error: 'cycle_id y year requeridos' }, { status: 400 })
  const supabase = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: dims } = await sb.from('strategic_dimensions').select('id, code, name').eq('cycle_id', cycleId).eq('status', 'active')
  const dimIds = (dims ?? []).map((d: { id: string }) => d.id)
  if (!dimIds.length) return NextResponse.json([])

  const { data: objs } = await sb.from('strategic_objectives').select('id, code, name, dimension_id').in('dimension_id', dimIds).eq('status', 'active')
  const objIds = (objs ?? []).map((o: { id: string }) => o.id)

  const { data: strats } = await sb.from('strategic_strategies').select('id, code, name, objective_id').in('objective_id', objIds.length ? objIds : ['']).eq('status', 'active')
  const stratIds = (strats ?? []).map((s: { id: string }) => s.id)

  const { data: actions } = await sb.from('strategic_actions').select('id, code, name, strategy_id').in('strategy_id', stratIds.length ? stratIds : ['']).eq('status', 'active')
  const actionIds = (actions ?? []).map((a: { id: string }) => a.id)

  const { data: responsibles } = await sb.from('strategic_action_responsibles').select('id, action_id').in('action_id', actionIds.length ? actionIds : [''])
  const respIds = (responsibles ?? []).map((r: { id: string }) => r.id)

  const { data: progress } = await sb
    .from('strategic_responsible_progress')
    .select('responsible_id, progress_pct')
    .in('responsible_id', respIds.length ? respIds : [''])
    .eq('year', Number(year))

  const progressByResp: Record<string, number> = {}
  for (const p of progress ?? []) progressByResp[p.responsible_id] = p.progress_pct ?? 0

  const respByAction: Record<string, string[]> = {}
  for (const r of responsibles ?? []) {
    if (!respByAction[r.action_id]) respByAction[r.action_id] = []
    respByAction[r.action_id].push(r.id)
  }

  const actionAvg: Record<string, number | null> = {}
  for (const a of actions ?? []) {
    const ids = respByAction[a.id] ?? []
    const vals = ids.filter(id => progressByResp[id] !== undefined).map(id => progressByResp[id])
    actionAvg[a.id] = avg(vals)
  }

  const actionsByStrat: Record<string, string[]> = {}
  for (const a of actions ?? []) {
    if (!actionsByStrat[a.strategy_id]) actionsByStrat[a.strategy_id] = []
    actionsByStrat[a.strategy_id].push(a.id)
  }
  const stratAvg: Record<string, number | null> = {}
  for (const s of strats ?? []) {
    const vals = (actionsByStrat[s.id] ?? []).map(id => actionAvg[id]).filter((v): v is number => v !== null)
    stratAvg[s.id] = avg(vals)
  }

  const stratsByObj: Record<string, string[]> = {}
  for (const s of strats ?? []) {
    if (!stratsByObj[s.objective_id]) stratsByObj[s.objective_id] = []
    stratsByObj[s.objective_id].push(s.id)
  }
  const objAvg: Record<string, number | null> = {}
  for (const o of objs ?? []) {
    const vals = (stratsByObj[o.id] ?? []).map(id => stratAvg[id]).filter((v): v is number => v !== null)
    objAvg[o.id] = avg(vals)
  }

  const objsByDim: Record<string, string[]> = {}
  for (const o of objs ?? []) {
    if (!objsByDim[o.dimension_id]) objsByDim[o.dimension_id] = []
    objsByDim[o.dimension_id].push(o.id)
  }

  const result = (dims ?? []).map((d: { id: string; code: string; name: string }) => {
    const dimObjs = (objsByDim[d.id] ?? []).map(objId => {
      const o = (objs ?? []).find((x: { id: string }) => x.id === objId)
      const objStrats = (stratsByObj[objId] ?? []).map(stratId => {
        const s = (strats ?? []).find((x: { id: string }) => x.id === stratId)
        const stratActions = (actionsByStrat[stratId] ?? []).map(actionId => {
          const a = (actions ?? []).find((x: { id: string }) => x.id === actionId)
          return { id: actionId, code: a?.code, name: a?.name, progress: actionAvg[actionId] }
        })
        return { id: stratId, code: s?.code, name: s?.name, progress: stratAvg[stratId], actions: stratActions }
      })
      return { id: objId, code: o?.code, name: o?.name, progress: objAvg[objId], strategies: objStrats }
    })
    const vals = dimObjs.map((o: { progress: number | null }) => o.progress).filter((v: number | null): v is number => v !== null)
    return { id: d.id, code: d.code, name: d.name, progress: avg(vals), objectives: dimObjs }
  })

  return NextResponse.json(result)
}
