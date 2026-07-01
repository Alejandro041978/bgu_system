import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get('plan_id')
  if (!planId) return NextResponse.json({ error: 'plan_id requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db() as any

  const [pkRes, kpiRes, empRes] = await Promise.all([
    sb.from('effectiveness_plan_kpis')
      .select('id, plan_id, kpi_id, link_type, link_id, meta_operator, meta, responsible_id, resultado, resultado_updated_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true }),
    sb.from('effectiveness_kpis').select('id, code, level, name, formula, frequency, value_type'),
    sb.from('hr_employees').select('id, full_name'),
  ])

  if (pkRes.error) return NextResponse.json({ error: pkRes.error.message }, { status: 500 })

  const kpiMap = Object.fromEntries((kpiRes.data ?? []).map((k: { id: string }) => [k.id, k]))
  const empMap = Object.fromEntries((empRes.data ?? []).map((e: { id: string }) => [e.id, e]))

  // Resolve link labels
  const rows = (pkRes.data ?? []) as Array<{
    id: string; plan_id: string; kpi_id: string; link_type: string | null;
    link_id: string | null; meta_operator: string | null; meta: number | null; responsible_id: string | null;
    resultado: number | null; resultado_updated_at: string | null
  }>

  const objIds = rows.filter(r => r.link_type === 'objetivo' && r.link_id).map(r => r.link_id!)
  const actIds = rows.filter(r => r.link_type === 'accion_estrategica' && r.link_id).map(r => r.link_id!)
  const respIds = rows.filter(r => r.link_type === 'accion_responsable' && r.link_id).map(r => r.link_id!)

  const [objRes, actRes, respRes] = await Promise.all([
    objIds.length ? sb.from('strategic_objectives').select('id, code, name').in('id', objIds) : { data: [] },
    actIds.length ? sb.from('strategic_actions').select('id, code, name').in('id', actIds) : { data: [] },
    respIds.length ? sb.from('strategic_responsible_progress').select('id, action_id, responsible_id').in('id', respIds) : { data: [] },
  ])

  const objMap = Object.fromEntries((objRes.data ?? []).map((o: { id: string; code: string; name: string }) => [o.id, o.code]))
  const actMap = Object.fromEntries((actRes.data ?? []).map((a: { id: string; code: string; name: string }) => [a.id, a.code]))

  // For responsible actions, get action + employee names
  const respActionIds = [...new Set((respRes.data ?? []).map((r: { action_id: string }) => r.action_id))]
  const respEmpIds = [...new Set((respRes.data ?? []).map((r: { responsible_id: string }) => r.responsible_id))]
  const [raRes, reRes] = await Promise.all([
    respActionIds.length ? sb.from('strategic_actions').select('id, code, name').in('id', respActionIds) : { data: [] },
    respEmpIds.length ? sb.from('hr_employees').select('id, full_name').in('id', respEmpIds) : { data: [] },
  ])
  const raMap = Object.fromEntries((raRes.data ?? []).map((a: { id: string; code: string; name: string }) => [a.id, a.code]))
  const reMap = Object.fromEntries((reRes.data ?? []).map((e: { id: string; full_name: string }) => [e.id, e.full_name]))
  const respMap = Object.fromEntries((respRes.data ?? []).map((r: { id: string; action_id: string; responsible_id: string }) => [
    r.id, `${raMap[r.action_id] ?? '—'} → ${reMap[r.responsible_id] ?? '—'}`
  ]))

  const enriched = rows.map(pk => ({
    ...pk,
    kpi: kpiMap[pk.kpi_id] ?? null,
    responsible: pk.responsible_id ? empMap[pk.responsible_id] ?? null : null,
    link_label: pk.link_id
      ? (pk.link_type === 'objetivo' ? objMap[pk.link_id]
        : pk.link_type === 'accion_estrategica' ? actMap[pk.link_id]
        : pk.link_type === 'accion_responsable' ? respMap[pk.link_id]
        : null) ?? null
      : null,
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    plan_id: string; kpi_id: string; link_type?: string; link_id?: string;
    meta_operator?: string; meta?: number; responsible_id?: string; resultado?: number; resultado_updated_at?: string
  }
  if (!body.plan_id || !body.kpi_id) {
    return NextResponse.json({ error: 'plan_id y kpi_id requeridos' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('effectiveness_plan_kpis')
    .insert({
      plan_id: body.plan_id,
      kpi_id: body.kpi_id,
      link_type: body.link_type ?? null,
      link_id: body.link_id ?? null,
      meta_operator: body.meta_operator ?? '>=',
      meta: body.meta ?? null,
      responsible_id: body.responsible_id ?? null,
      resultado: body.resultado ?? null,
      resultado_updated_at: body.resultado_updated_at ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string; meta_operator?: string | null; meta?: number | null; responsible_id?: string | null;
    resultado?: number | null; resultado_updated_at?: string | null;
    link_type?: string | null; link_id?: string | null
  }
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('meta_operator' in body) updates.meta_operator = body.meta_operator ?? '>='
  if ('meta' in body) updates.meta = body.meta ?? null
  if ('responsible_id' in body) updates.responsible_id = body.responsible_id ?? null
  if ('resultado' in body) updates.resultado = body.resultado ?? null
  if ('resultado_updated_at' in body) updates.resultado_updated_at = body.resultado_updated_at ?? null
  if ('link_type' in body) updates.link_type = body.link_type ?? null
  if ('link_id' in body) updates.link_id = body.link_id ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('effectiveness_plan_kpis')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('effectiveness_plan_kpis').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
