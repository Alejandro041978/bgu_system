import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Returns strategic plan items valid for a given year (SCD Type 2 aware).
// Falls back to the most recent version with valid_from_year <= plan_year if no exact match.
export async function GET(req: NextRequest) {
  const linkType = req.nextUrl.searchParams.get('link_type') ?? ''
  const planYear = parseInt(req.nextUrl.searchParams.get('plan_year') ?? '0')
  if (!planYear || !linkType) {
    return NextResponse.json({ error: 'plan_year y link_type requeridos' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db() as any

  if (linkType === 'objetivo') {
    // Get objectives with valid_from_year <= planYear, pick the "best" version per code
    const { data, error } = await sb
      .from('strategic_objectives')
      .select('id, code, name, valid_from_year, valid_to_year, status, dimension_id')
      .lte('valid_from_year', planYear)
      .order('valid_from_year', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Deduplicate by code, prefer active within year, else nearest prior
    const best = deduplicateSCD(data as SCDRow[], planYear)
    return NextResponse.json(best.map(r => ({
      id: r.id, label: `${r.code} · ${r.name}`, code: r.code, name: r.name,
    })))
  }

  if (linkType === 'accion_estrategica') {
    const { data, error } = await sb
      .from('strategic_actions')
      .select('id, code, name, valid_from_year, valid_to_year, status, strategy_id')
      .lte('valid_from_year', planYear)
      .order('valid_from_year', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const best = deduplicateSCD(data as SCDRow[], planYear)

    // Enrich with strategy/objective context
    const strategyIds = [...new Set(best.map(r => r.strategy_id).filter(Boolean))]
    const { data: strategies } = await sb
      .from('strategic_strategies')
      .select('id, code, name, objective_id')
      .in('id', strategyIds)
    const stratMap = Object.fromEntries((strategies ?? []).map((s: { id: string; code: string; name: string; objective_id: string }) => [s.id, s]))

    return NextResponse.json(best.map(r => {
      const strat = stratMap[r.strategy_id ?? '']
      return {
        id: r.id,
        label: `${r.code} · ${r.name}${strat ? ` (${strat.code})` : ''}`,
        code: r.code, name: r.name,
      }
    }))
  }

  if (linkType === 'accion_responsable') {
    const { data, error } = await sb
      .from('strategic_responsible_progress')
      .select('id, action_id, responsible_id, created_at')
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get distinct action_ids and filter by year via the actions table
    const actionIds = [...new Set((data ?? []).map((r: { action_id: string }) => r.action_id))]
    if (actionIds.length === 0) return NextResponse.json([])

    const { data: actions } = await sb
      .from('strategic_actions')
      .select('id, code, name, valid_from_year, valid_to_year, status')
      .in('id', actionIds)
      .lte('valid_from_year', planYear)

    const bestActions = deduplicateSCD((actions ?? []) as SCDRow[], planYear)
    const bestActionIds = new Set(bestActions.map(a => a.id))
    const actionMap = Object.fromEntries(bestActions.map(a => [a.id, a]))

    const empIds = [...new Set((data ?? []).map((r: { responsible_id: string }) => r.responsible_id).filter(Boolean))]
    const { data: emps } = await sb.from('hr_employees').select('id, full_name').in('id', empIds)
    const empMap = Object.fromEntries((emps ?? []).map((e: { id: string; full_name: string }) => [e.id, e]))

    const filtered = (data ?? []).filter((r: { action_id: string }) => bestActionIds.has(r.action_id))
    return NextResponse.json(filtered.map((r: { id: string; action_id: string; responsible_id: string }) => {
      const act = actionMap[r.action_id]
      const emp = empMap[r.responsible_id]
      return {
        id: r.id,
        label: `${act?.code ?? ''} · ${act?.name ?? ''} → ${emp?.full_name ?? '—'}`,
        code: act?.code, name: act?.name,
      }
    }))
  }

  return NextResponse.json({ error: 'link_type inválido' }, { status: 400 })
}

interface SCDRow {
  id: string
  code: string
  name: string
  valid_from_year: number
  valid_to_year: number | null
  status: string
  strategy_id?: string
  dimension_id?: string
  [key: string]: unknown
}

function deduplicateSCD(rows: SCDRow[], planYear: number): SCDRow[] {
  // Group by code, pick: active within year first, else highest valid_from_year <= planYear
  const groups = new Map<string, SCDRow[]>()
  for (const row of rows) {
    if (!groups.has(row.code)) groups.set(row.code, [])
    groups.get(row.code)!.push(row)
  }

  const result: SCDRow[] = []
  for (const versions of groups.values()) {
    // active and covers the year
    const activeInYear = versions.find(
      v => v.status === 'active' && v.valid_from_year <= planYear && (v.valid_to_year == null || v.valid_to_year >= planYear)
    )
    if (activeInYear) { result.push(activeInYear); continue }

    // superseded but covered the year
    const coveredYear = versions.find(
      v => v.valid_from_year <= planYear && v.valid_to_year != null && v.valid_to_year >= planYear
    )
    if (coveredYear) { result.push(coveredYear); continue }

    // fallback: nearest prior (highest valid_from_year <= planYear)
    const prior = versions.filter(v => v.valid_from_year <= planYear).sort((a, b) => b.valid_from_year - a.valid_from_year)[0]
    if (prior) result.push(prior)
  }

  return result.sort((a, b) => a.code.localeCompare(b.code))
}
