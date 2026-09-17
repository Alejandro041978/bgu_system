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
//   · Plan de Evaluación → iap_measures.indicator_id: IDENTIDAD 1 a 1. Los 20
//     KPIs de ese plan (D-01…D-09, I-01…I-11) son KPIs de pleno derecho: unos
//     COEXISTEN con otros planes (mismo indicador, otro código: I-08 = E1-I03)
//     y otros son exclusivos de evaluación (owner_plan 'iap'). Nunca 1 a
//     varios: los 'cruces' del documento del IAP NO son pertenencia (corrección
//     del usuario, 17/09/2026).
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
    ? await sb.from('iap_measures').select('id, code, name, indicator_id, result_value').eq('plan_id', iap.id).order('code')
    : { data: [] }

  return { ciclo, objetivoDeDim, planEfec, iap, medidas: (medidas ?? []) as { id: string; code: string; name: string; indicator_id: string | null; result_value: number | null }[] }
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

  const [{ data: kpis }, { data: spk }, { data: epk }] = await Promise.all([
    sb.from('effectiveness_kpis').select('id, code'),
    ctx.ciclo ? sb.from('strategic_plan_kpis').select('kpi_id, strategic_code, objective_id').eq('cycle_id', ctx.ciclo.id) : Promise.resolve({ data: [] }),
    ctx.planEfec ? sb.from('effectiveness_plan_kpis').select('kpi_id, meta, link_id').eq('plan_id', ctx.planEfec.id) : Promise.resolve({ data: [] }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const k of (kpis ?? []) as any[]) {
    const ancla = objetivoDe(k.code, ctx.objetivoDeDim)
    out[k.id] = { estrategico: null, efectividad: null, evaluacion: null, ancla: ancla?.code ?? null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (spk ?? []) as any[]) if (out[r.kpi_id]) out[r.kpi_id].estrategico = { alias: r.strategic_code ?? null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (epk ?? []) as any[]) if (out[r.kpi_id]) out[r.kpi_id].efectividad = { meta: r.meta ?? null }
  // Evaluación: identidad 1 a 1 — el KPI ES el indicador de esa ficha del IAP
  for (const m of ctx.medidas) {
    if (m.indicator_id && out[m.indicator_id]) out[m.indicator_id].evaluacion = { code: m.code }
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
    contexto: {
      ciclo: ctx.ciclo?.name ?? null,
      plan_efectividad: ctx.planEfec?.name ?? null,
      plan_evaluacion: ctx.iap?.name ?? null,
    },
  })
}

// POST { kpi_id, plan: 'estrategico' | 'efectividad', on: boolean, alias? }
// POST { kpi_id, plan: 'evaluacion', on: boolean, code? } — identidad 1 a 1
export async function POST(req: NextRequest) {
  const no = await guardPlanning()
  if (no) return no
  const b = await req.json().catch(() => null) as {
    kpi_id?: string; plan?: string; on?: boolean; alias?: string | null; code?: string | null
  } | null
  if (!b?.kpi_id || !b.plan) return NextResponse.json({ error: 'Faltan kpi_id o plan' }, { status: 400 })
  const sb = db()
  const { data: kpi } = await sb.from('effectiveness_kpis').select('id, code, name, owner_plan').eq('id', b.kpi_id).maybeSingle()
  if (!kpi) return NextResponse.json({ error: 'KPI no encontrado' }, { status: 404 })
  const ctx = await contexto(sb)

  if (b.plan === 'evaluacion') {
    if (!ctx.iap) return NextResponse.json({ error: 'No hay plan de evaluación cargado' }, { status: 409 })
    const suya = ctx.medidas.find(m => m.indicator_id === kpi.id) ?? null
    if (b.on) {
      if (suya) return NextResponse.json({ ok: true, ya_estaba: true, code: suya.code })
      // El KPI entra al plan de evaluación con SU código de ese plan (D-nn
      // directo / I-nn indirecto). La ficha nace mínima: propósito, evidencia,
      // meta y cadencia se completan en Plan de Evaluación › Cargar Plan.
      const code = String(b.code ?? '').trim().toUpperCase()
      if (!/^[DI]-\d{2}$/.test(code)) return NextResponse.json({ error: 'El código de evaluación debe tener la forma D-10 (directo) o I-12 (indirecto).' }, { status: 400 })
      if (ctx.medidas.some(m => String(m.code).toUpperCase() === code)) return NextResponse.json({ error: `El código ${code} ya lo usa otro KPI del plan de evaluación.` }, { status: 409 })
      const { error } = await sb.from('iap_measures').insert({
        plan_id: ctx.iap.id, code, name: kpi.name,
        measure_type: code.startsWith('D') ? 'directa' : 'indirecta',
        frequency: 'anual', indicator_id: kpi.id,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, code })
    }
    if (!suya) return NextResponse.json({ ok: true })
    // Un KPI exclusivo de evaluación no puede quedarse sin plan
    if (kpi.owner_plan === 'iap') {
      return NextResponse.json({ error: `${kpi.code} es un KPI exclusivo del plan de evaluación: no puede quedar sin plan. Si ya no aplica, se da de baja su ficha en el Plan de Evaluación.` }, { status: 409 })
    }
    // Quitar = dar de baja su ficha del IAP; con resultado registrado no se permite
    if (suya.result_value !== null && suya.result_value !== undefined) {
      return NextResponse.json({ error: `${suya.code} ya tiene un resultado registrado en el plan de evaluación: no se quita desde el catálogo.` }, { status: 409 })
    }
    const { error } = await sb.from('iap_measures').delete().eq('id', suya.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
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
