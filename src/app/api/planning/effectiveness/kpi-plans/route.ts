import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Pertenencia de cada KPI a los tres planes (17/09/2026).
//
// El catálogo es ÚNICO (effectiveness_kpis, nombre histórico) y la pertenencia
// vive en ENLACES:
//   · Plan Estratégico  → strategic_plan_kpis (ciclo activo), con alias K
//   · Plan de Efectividad → effectiveness_plan_kpis (plan del año vigente)
//   · Plan de Evaluación → iap_measure_kpis: un KPI "pertenece" cuando alguna
//     MEDIDA lo triangula (el plan de evaluación no tiene KPIs, tiene medidas)
//
// El ANCLA de estratégico y efectividad se deriva sola: el prefijo del código
// del KPI es su dimensión (E3-… → D3) y cada dimensión activa tiene un único
// objetivo activo (O3). Regla confirmada por el usuario: D8/D9 seguirán la
// misma nomenclatura (E8-…, E9-…).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contexto(sb: any) {
  const { data: ciclos } = await sb.from('strategic_plan_cycles').select('id, name, status').order('created_at')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ciclo = ((ciclos ?? []) as any[]).find(c => c.status === 'active') ?? null
  const { data: dims } = ciclo
    ? await sb.from('strategic_dimensions').select('id, code, status').eq('cycle_id', ciclo.id).eq('status', 'active')
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dimIds = ((dims ?? []) as any[]).map(d => d.id)
  const { data: objs } = dimIds.length
    ? await sb.from('strategic_objectives').select('id, code, name, dimension_id, status').in('dimension_id', dimIds).eq('status', 'active')
    : { data: [] }
  // dimensión "D3" → su objetivo activo (uno solo por dimensión)
  const objetivoDeDim = new Map<string, { id: string; code: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (dims ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suyos = ((objs ?? []) as any[]).filter(o => o.dimension_id === d.id)
    if (suyos.length === 1) objetivoDeDim.set(String(d.code).toUpperCase(), { id: suyos[0].id, code: suyos[0].code })
  }

  // Plan de efectividad del año académico vigente (o el más reciente)
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: anio } = await sb.from('academic_years').select('id').lte('start_date', hoy).gte('end_date', hoy).limit(1).maybeSingle()
  const { data: planes } = await sb.from('effectiveness_plans').select('id, name, academic_year_id, created_at').order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planEfec = ((planes ?? []) as any[]).find(p => anio && p.academic_year_id === anio.id) ?? (planes ?? [])[0] ?? null

  // Plan de evaluación activo y sus medidas
  const { data: iaps } = await sb.from('iap_plans').select('id, name, status, created_at').order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iap = ((iaps ?? []) as any[]).find(p => p.status === 'active') ?? (iaps ?? [])[0] ?? null
  const { data: medidas } = iap
    ? await sb.from('iap_measures').select('id, code, name').eq('plan_id', iap.id).order('code')
    : { data: [] }

  return { ciclo, objetivoDeDim, planEfec, iap, medidas: (medidas ?? []) as { id: string; code: string; name: string }[] }
}

const objetivoDe = (code: string, mapa: Map<string, { id: string; code: string }>) => {
  const m = String(code ?? '').trim().toUpperCase().match(/^E(\d+)-/)
  return m ? (mapa.get(`D${m[1]}`) ?? null) : null
}

export async function GET() {
  const no = await guardPlanning()
  if (no) return no
  const sb = db()
  const ctx = await contexto(sb)

  const [{ data: kpis }, { data: spk }, { data: epk }, { data: mk }] = await Promise.all([
    sb.from('effectiveness_kpis').select('id, code'),
    ctx.ciclo ? sb.from('strategic_plan_kpis').select('kpi_id, strategic_code, objective_id').eq('cycle_id', ctx.ciclo.id) : Promise.resolve({ data: [] }),
    ctx.planEfec ? sb.from('effectiveness_plan_kpis').select('kpi_id, meta, link_id').eq('plan_id', ctx.planEfec.id) : Promise.resolve({ data: [] }),
    sb.from('iap_measure_kpis').select('measure_id, kpi_id'),
  ])
  const medidaIds = new Set(ctx.medidas.map(m => m.id))
  const codigoDeMedida = new Map(ctx.medidas.map(m => [m.id, m.code]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const k of (kpis ?? []) as any[]) {
    const ancla = objetivoDe(k.code, ctx.objetivoDeDim)
    out[k.id] = { estrategico: null, efectividad: null, medidas: [] as string[], ancla: ancla?.code ?? null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (spk ?? []) as any[]) if (out[r.kpi_id]) out[r.kpi_id].estrategico = { alias: r.strategic_code ?? null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (epk ?? []) as any[]) if (out[r.kpi_id]) out[r.kpi_id].efectividad = { meta: r.meta ?? null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (mk ?? []) as any[]) {
    if (out[r.kpi_id] && medidaIds.has(r.measure_id)) out[r.kpi_id].medidas.push(r.measure_id)
  }
  // ¿Tiene resultados medidos? Quitar una pertenencia no los borra (viven por
  // año en indicator_results), pero se advierte antes de desmarcar.
  try {
    const { data: res } = await sb.from('indicator_results').select('indicator_id')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (res ?? []) as any[]) if (out[r.indicator_id]) out[r.indicator_id].tiene_resultado = true
  } catch { /* tabla ausente: sin aviso */ }

  return NextResponse.json({
    pertenencias: out,
    medidas: ctx.medidas.map(m => ({ id: m.id, code: m.code, name: m.name })),
    contexto: {
      ciclo: ctx.ciclo?.name ?? null,
      plan_efectividad: ctx.planEfec?.name ?? null,
      plan_evaluacion: ctx.iap?.name ?? null,
    },
    codigo_de_medida: Object.fromEntries(codigoDeMedida),
  })
}

// POST { kpi_id, plan: 'estrategico' | 'efectividad', on: boolean, alias? }
// POST { kpi_id, plan: 'evaluacion', measure_ids: string[] }
export async function POST(req: NextRequest) {
  const no = await guardPlanning()
  if (no) return no
  const b = await req.json().catch(() => null) as {
    kpi_id?: string; plan?: string; on?: boolean; alias?: string | null; measure_ids?: string[]
  } | null
  if (!b?.kpi_id || !b.plan) return NextResponse.json({ error: 'Faltan kpi_id o plan' }, { status: 400 })
  const sb = db()
  const { data: kpi } = await sb.from('effectiveness_kpis').select('id, code, name').eq('id', b.kpi_id).maybeSingle()
  if (!kpi) return NextResponse.json({ error: 'KPI no encontrado' }, { status: 404 })
  const ctx = await contexto(sb)

  if (b.plan === 'evaluacion') {
    const validas = new Set(ctx.medidas.map(m => m.id))
    const pedidas = [...new Set((b.measure_ids ?? []).map(String))].filter(id => validas.has(id))
    const { data: actuales } = await sb.from('iap_measure_kpis').select('measure_id').eq('kpi_id', kpi.id)
    const tenia = new Set(((actuales ?? []) as { measure_id: string }[]).map(r => r.measure_id).filter(id => validas.has(id)))
    const agregar = pedidas.filter(id => !tenia.has(id))
    const quitar = [...tenia].filter(id => !pedidas.includes(id))
    if (agregar.length) {
      const { error } = await sb.from('iap_measure_kpis').upsert(agregar.map(measure_id => ({ measure_id, kpi_id: kpi.id })), { onConflict: 'measure_id,kpi_id', ignoreDuplicates: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (quitar.length) {
      const { error } = await sb.from('iap_measure_kpis').delete().eq('kpi_id', kpi.id).in('measure_id', quitar)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, medidas: pedidas.length })
  }

  if (b.plan !== 'estrategico' && b.plan !== 'efectividad') return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  const ancla = objetivoDe(kpi.code, ctx.objetivoDeDim)

  if (b.plan === 'estrategico') {
    if (!ctx.ciclo) return NextResponse.json({ error: 'No hay ciclo estratégico activo' }, { status: 409 })
    if (b.on) {
      if (!ancla) return NextResponse.json({ error: `No se pudo derivar el objetivo del código "${kpi.code}": debe empezar con E<dimensión>- y la dimensión tener un único objetivo activo.` }, { status: 409 })
      const alias = b.alias ? String(b.alias).trim().toUpperCase().slice(0, 20) || null : null
      const { data: ya } = await sb.from('strategic_plan_kpis').select('id').eq('cycle_id', ctx.ciclo.id).eq('kpi_id', kpi.id).limit(1)
      if ((ya ?? []).length) {
        if (b.alias !== undefined) await sb.from('strategic_plan_kpis').update({ strategic_code: alias }).eq('cycle_id', ctx.ciclo.id).eq('kpi_id', kpi.id)
        return NextResponse.json({ ok: true, ya_estaba: true })
      }
      const { error } = await sb.from('strategic_plan_kpis').insert({ cycle_id: ctx.ciclo.id, kpi_id: kpi.id, objective_id: ancla.id, strategic_code: alias })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, objetivo: ancla.code })
    }
    const { error } = await sb.from('strategic_plan_kpis').delete().eq('cycle_id', ctx.ciclo.id).eq('kpi_id', kpi.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // efectividad
  if (!ctx.planEfec) return NextResponse.json({ error: 'No hay plan de efectividad cargado' }, { status: 409 })
  if (b.on) {
    if (!ancla) return NextResponse.json({ error: `No se pudo derivar el objetivo del código "${kpi.code}".` }, { status: 409 })
    const { data: ya } = await sb.from('effectiveness_plan_kpis').select('id').eq('plan_id', ctx.planEfec.id).eq('kpi_id', kpi.id).limit(1)
    if ((ya ?? []).length) return NextResponse.json({ ok: true, ya_estaba: true })
    const { error } = await sb.from('effectiveness_plan_kpis').insert({ plan_id: ctx.planEfec.id, kpi_id: kpi.id, link_type: 'objetivo', link_id: ancla.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, objetivo: ancla.code })
  }
  const { error } = await sb.from('effectiveness_plan_kpis').delete().eq('plan_id', ctx.planEfec.id).eq('kpi_id', kpi.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
