import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const planId = req.nextUrl.searchParams.get('plan_id')
  if (!planId) return NextResponse.json({ error: 'plan_id requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db() as any

  const [pkRes, kpiRes, empRes] = await Promise.all([
    sb.from('effectiveness_plan_kpis')
      .select('id, plan_id, kpi_id, link_type, link_id, meta_operator, meta, responsible_id, resultado, resultado_updated_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true }),
    sb.from('effectiveness_kpis').select('id, code, level, name, formula, frequency, value_type, formula_type'),
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
    // Desde el 10/09/2026 el avance vive por ACCIÓN (strategic_action_progress);
    // el link_type 'accion_responsable' se conserva por compatibilidad.
    respIds.length ? sb.from('strategic_action_progress').select('id, action_id, year').in('id', respIds) : { data: [] },
  ])

  const objMap = Object.fromEntries((objRes.data ?? []).map((o: { id: string; code: string; name: string }) => [o.id, o.code]))
  const actMap = Object.fromEntries((actRes.data ?? []).map((a: { id: string; code: string; name: string }) => [a.id, a.code]))

  const respActionIds = [...new Set((respRes.data ?? []).map((r: { action_id: string }) => r.action_id))]
  const raRes = respActionIds.length
    ? await sb.from('strategic_actions').select('id, code, name').in('id', respActionIds)
    : { data: [] }
  const raMap = Object.fromEntries((raRes.data ?? []).map((a: { id: string; code: string; name: string }) => [a.id, a.code]))
  const respMap = Object.fromEntries((respRes.data ?? []).map((r: { id: string; action_id: string; year: number }) => [
    r.id, `${raMap[r.action_id] ?? '—'} → avance ${r.year}`
  ]))

  // El código y el nivel son del KPI DENTRO de este plan (plan_code: E1-S01, la
  // letra I/O/S es el nivel). Consulta aparte y tolerante: si la migración
  // kpi_codigo_por_plan.sql aún no corrió, se cae al código del catálogo.
  const pcRes = await sb.from('effectiveness_plan_kpis').select('id, plan_code').eq('plan_id', planId)
  const planCode: Record<string, string> = Object.fromEntries(
    ((pcRes.error ? [] : pcRes.data) ?? []).filter((r: { plan_code: string | null }) => r.plan_code).map((r: { id: string; plan_code: string }) => [r.id, r.plan_code]))
  const NIVEL: Record<string, string> = { I: 'institucional', O: 'operativo', S: 'estrategico' }
  const conCodigoDelPlan = (pkId: string, kpi: { code: string; level: string } | undefined) => {
    const pc = planCode[pkId]
    if (!kpi || !pc) return kpi ?? null
    const letra = pc.match(/^Ed+-([IOS])d+$/)?.[1]
    return { ...kpi, code: pc, level: letra ? NIVEL[letra] : kpi.level }
  }

  const enriched = rows.map(pk => ({
    ...pk,
    kpi: conCodigoDelPlan(pk.id, kpiMap[pk.kpi_id]),
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
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const body = await req.json() as {
    plan_id: string; kpi_id: string; link_type?: string; link_id?: string;
    meta_operator?: string; meta?: number; responsible_id?: string; resultado?: number; resultado_updated_at?: string
  }
  if (!body.plan_id || !body.kpi_id) {
    return NextResponse.json({ error: 'plan_id y kpi_id requeridos' }, { status: 400 })
  }
  // Un KPI entra UNA sola vez en un mismo plan.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: yaEsta } = await (db() as any).from('effectiveness_plan_kpis')
    .select('id').eq('plan_id', body.plan_id).eq('kpi_id', body.kpi_id).limit(1)
  if ((yaEsta ?? []).length) return NextResponse.json({ error: 'Este KPI ya está vinculado a este plan.' }, { status: 409 })

  // Solo se vinculan KPIs que el catálogo declara del plan de efectividad: los
  // que ya tienen SU código de efectividad. El código viaja al nuevo enlace
  // (así un plan 2026-2027 hereda E1-S01 sin volver a teclearlo).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: previos, error: ePrev } = await (db() as any).from('effectiveness_plan_kpis')
    .select('plan_code').eq('kpi_id', body.kpi_id).not('plan_code', 'is', null).order('created_at', { ascending: false }).limit(1)
  const planCode: string | null = previos?.[0]?.plan_code ?? null
  if (!ePrev && !planCode) {
    return NextResponse.json({ error: 'Este KPI no está declarado del plan de efectividad. Márcalo primero en el Catálogo de KPIs, donde recibe su código (E#-I/O/S##).' }, { status: 409 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('effectiveness_plan_kpis')
    .insert({
      ...(planCode ? { plan_code: planCode } : {}),
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
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

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
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('effectiveness_plan_kpis').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
