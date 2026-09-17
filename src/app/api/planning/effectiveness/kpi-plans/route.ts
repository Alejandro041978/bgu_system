import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Pertenencia de cada KPI a los tres planes, CON SU CÓDIGO EN CADA PLAN.
//
// Regla del usuario (17/09/2026): un indicador es una DENOMINACIÓN; el código
// no es del KPI sino del KPI dentro de un plan, y habla el idioma de ese plan:
//   · Efectividad  E1-S01 → effectiveness_plan_kpis.plan_code
//       E# = estrategia/dimensión; I/O/S = institucional/operativo/estratégico
//       (el "nivel" NO es un atributo del KPI: es parte de este acrónimo)
//   · Estratégico  E1-K4  → strategic_plan_kpis.strategic_code
//   · Evaluación   D-05   → iap_measures.code, identidad 1 a 1 por indicator_id
//       (D/I = directo/indirecto; coexiste con otro plan o es exclusivo)
// Siempre 1 a 1: un indicador, hasta tres códigos. El objetivo al que se ancla
// en estratégico/efectividad se deriva del E# del código DE ESE PLAN (E3 → D3
// → su único objetivo activo). effectiveness_kpis.code queda como id interno.
// ---------------------------------------------------------------------------

const RE_EFEC = /^E\d+-[IOS]\d+$/
const RE_ESTR = /^E\d+-K\d+$/
const RE_EVAL = /^[DI]-\d{2}$/
const NIVEL: Record<string, string> = { I: 'institucional', O: 'operativo', S: 'estrategico' }
const norm = (s: unknown) => String(s ?? '').trim().toUpperCase()

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
  const objetivoDeDim = new Map<string, { id: string; code: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (dims ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suyos = ((objs ?? []) as any[]).filter(o => o.dimension_id === d.id)
    if (suyos.length === 1) objetivoDeDim.set(norm(d.code), { id: suyos[0].id, code: suyos[0].code })
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const { data: anio } = await sb.from('academic_years').select('id').lte('start_date', hoy).gte('end_date', hoy).limit(1).maybeSingle()
  const { data: planes } = await sb.from('effectiveness_plans').select('id, name, academic_year_id, created_at').order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planEfec = ((planes ?? []) as any[]).find(p => anio && p.academic_year_id === anio.id) ?? (planes ?? [])[0] ?? null

  // Mismo criterio que efectividad: el plan del año académico en curso; si
  // no existe, el más reciente. (Antes: 'el activo', que con varios planes
  // anuales no distingue nada.)
  const { data: iaps } = await sb.from('iap_plans').select('id, name, status, start_academic_year_id, created_at').order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iap = ((iaps ?? []) as any[]).find(p => anio && p.start_academic_year_id === anio.id) ?? (iaps ?? [])[0] ?? null
  const { data: medidas } = iap
    ? await sb.from('iap_measures').select('id, code, name, indicator_id, result_value').eq('plan_id', iap.id).order('code')
    : { data: [] }

  return { ciclo, objetivoDeDim, planEfec, iap, medidas: (medidas ?? []) as { id: string; code: string; name: string; indicator_id: string | null; result_value: number | null }[] }
}

// E3-S01 / E3-K2 → objetivo único de la dimensión D3
const objetivoDe = (code: string, mapa: Map<string, { id: string; code: string }>) => {
  const m = norm(code).match(/^E(\d+)-/)
  return m ? (mapa.get(`D${m[1]}`) ?? null) : null
}

// Enlaces de efectividad, tolerante a que plan_code aún no exista
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enlacesEfectividad(sb: any, planId: string): Promise<{ filas: any[]; migrado: boolean }> {
  const r = await sb.from('effectiveness_plan_kpis').select('id, kpi_id, meta, plan_code').eq('plan_id', planId)
  if (!r.error) return { filas: r.data ?? [], migrado: true }
  const r2 = await sb.from('effectiveness_plan_kpis').select('id, kpi_id, meta').eq('plan_id', planId)
  return { filas: r2.data ?? [], migrado: false }
}

export async function GET() {
  const no = await guardPlanning()
  if (no) return no
  const sb = db()
  const ctx = await contexto(sb)

  const [{ data: kpis }, { data: spk }, efec, { data: anios }] = await Promise.all([
    sb.from('effectiveness_kpis').select('id, code'),
    ctx.ciclo ? sb.from('strategic_plan_kpis').select('kpi_id, strategic_code, valid_from_year_id, valid_to_year_id').eq('cycle_id', ctx.ciclo.id) : Promise.resolve({ data: [] }),
    ctx.planEfec ? enlacesEfectividad(sb, ctx.planEfec.id) : Promise.resolve({ filas: [], migrado: true }),
    sb.from('academic_years').select('id, name, start_date'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interno = new Map<string, string>(((kpis ?? []) as any[]).map(k => [String(k.id), norm(k.code)]))

  // Vigencia: SOLO el plan estratégico la tiene (es plurianual). Efectividad y
  // evaluación son anuales: el KPI rige si el plan de ese año lo incluye.
  // Aquí solo se REFLEJA; se edita en el Tablero de Indicadores.
  const hoy = new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anioDe = new Map<string, { etiqueta: string; start: string }>(((anios ?? []) as any[]).map(a => {
    const m = String(a.name).match(/(d{4})D+(d{4})/)
    return [String(a.id), { etiqueta: m ? `${m[1].slice(2)}-${m[2].slice(2)}` : String(a.name), start: String(a.start_date) }]
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = ((anios ?? []) as any[]).filter(a => String(a.start_date) <= hoy).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vigenciaDe = (r: any) => {
    const d = r.valid_from_year_id ? anioDe.get(String(r.valid_from_year_id)) : null
    const h = r.valid_to_year_id ? anioDe.get(String(r.valid_to_year_id)) : null
    if (!d && !h) return null
    const ref = actual ? String(actual.start_date) : hoy
    // Ambos extremos INCLUSIVE, comparando por inicio del año académico
    const estado = h && h.start < ref ? 'vencido' : d && d.start > ref ? 'futuro' : 'vigente'
    return { desde: d?.etiqueta ?? null, hasta: h?.etiqueta ?? null, estado }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const k of (kpis ?? []) as any[]) out[k.id] = { estrategico: null, efectividad: null, evaluacion: null, dimension: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (spk ?? []) as any[]) {
    if (!out[r.kpi_id]) continue
    const cat = interno.get(String(r.kpi_id)) ?? ''
    out[r.kpi_id].estrategico = { code: r.strategic_code ? norm(r.strategic_code) : (RE_ESTR.test(cat) ? cat : null), vigencia: vigenciaDe(r) }
  }
  for (const r of efec.filas) {
    if (!out[r.kpi_id]) continue
    const cat = interno.get(String(r.kpi_id)) ?? ''
    const code = r.plan_code ? norm(r.plan_code) : (RE_EFEC.test(cat) ? cat : null)
    const letra = code ? (code.match(/^E\d+-([IOS])/)?.[1] ?? null) : null
    out[r.kpi_id].efectividad = { code, nivel: letra ? NIVEL[letra] : null }
  }
  for (const m of ctx.medidas) {
    if (m.indicator_id && out[m.indicator_id]) {
      const c = norm(m.code)
      out[m.indicator_id].evaluacion = { code: c, tipo: c.startsWith('D') ? 'directo' : 'indirecto' }
    }
  }
  // Dimensión: el E# de sus códigos de plan; los exclusivos de evaluación se
  // agrupan por directos/indirectos.
  for (const id of Object.keys(out)) {
    const p = out[id]
    const e = (p.efectividad?.code ?? p.estrategico?.code ?? '') as string
    const m = e.match(/^(E\d+)-/)
    p.dimension = m ? m[1] : (p.evaluacion ? (p.evaluacion.code.startsWith('D') ? 'D' : 'I') : null)
  }
  try {
    const { data: res } = await sb.from('indicator_results').select('indicator_id')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (res ?? []) as any[]) if (out[r.indicator_id]) out[r.indicator_id].tiene_resultado = true
  } catch { /* tabla ausente: sin aviso */ }

  return NextResponse.json({
    pertenencias: out,
    migrado: efec.migrado,
    contexto: {
      ciclo: ctx.ciclo?.name ?? null,
      plan_efectividad: ctx.planEfec?.name ?? null,
      plan_evaluacion: ctx.iap?.name ?? null,
    },
  })
}

// POST { kpi_id, plan: 'estrategico'|'efectividad'|'evaluacion', on: boolean, code? }
// Marcar exige el CÓDIGO del KPI en ese plan (con su nomenclatura); si ya
// pertenece, el mismo POST con on:true cambia su código.
export async function POST(req: NextRequest) {
  const no = await guardPlanning()
  if (no) return no
  const b = await req.json().catch(() => null) as { kpi_id?: string; plan?: string; on?: boolean; code?: string | null } | null
  if (!b?.kpi_id || !b.plan) return NextResponse.json({ error: 'Faltan kpi_id o plan' }, { status: 400 })
  const sb = db()
  const { data: kpi } = await sb.from('effectiveness_kpis').select('id, code, name, owner_plan').eq('id', b.kpi_id).maybeSingle()
  if (!kpi) return NextResponse.json({ error: 'KPI no encontrado' }, { status: 404 })
  const ctx = await contexto(sb)
  const code = norm(b.code)

  // ── Evaluación: identidad 1 a 1 con su ficha del IAP ──────────────────────
  if (b.plan === 'evaluacion') {
    if (!ctx.iap) return NextResponse.json({ error: 'No hay plan de evaluación cargado' }, { status: 409 })
    const suya = ctx.medidas.find(m => m.indicator_id === kpi.id) ?? null
    if (b.on) {
      if (!RE_EVAL.test(code)) return NextResponse.json({ error: 'El código de evaluación debe tener la forma D-10 (directo) o I-12 (indirecto).' }, { status: 400 })
      if (ctx.medidas.some(m => norm(m.code) === code && m.id !== suya?.id)) return NextResponse.json({ error: `El código ${code} ya lo usa otro KPI del plan de evaluación.` }, { status: 409 })
      if (suya) {
        const { error } = await sb.from('iap_measures').update({ code, measure_type: code.startsWith('D') ? 'directa' : 'indirecta' }).eq('id', suya.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true, code })
      }
      const { error } = await sb.from('iap_measures').insert({
        plan_id: ctx.iap.id, code, name: kpi.name,
        measure_type: code.startsWith('D') ? 'directa' : 'indirecta',
        frequency: 'anual', indicator_id: kpi.id,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, code })
    }
    if (!suya) return NextResponse.json({ ok: true })
    if (kpi.owner_plan === 'iap') {
      return NextResponse.json({ error: 'Es un KPI exclusivo del plan de evaluación: no puede quedar sin plan. Si ya no aplica, se da de baja su ficha en el Plan de Evaluación.' }, { status: 409 })
    }
    if (suya.result_value !== null && suya.result_value !== undefined) {
      return NextResponse.json({ error: `${suya.code} ya tiene un resultado registrado en el plan de evaluación: no se quita desde el catálogo.` }, { status: 409 })
    }
    const { error } = await sb.from('iap_measures').delete().eq('id', suya.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Estratégico ───────────────────────────────────────────────────────────
  if (b.plan === 'estrategico') {
    if (!ctx.ciclo) return NextResponse.json({ error: 'No hay ciclo estratégico activo' }, { status: 409 })
    if (!b.on) {
      const { error } = await sb.from('strategic_plan_kpis').delete().eq('cycle_id', ctx.ciclo.id).eq('kpi_id', kpi.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (!RE_ESTR.test(code)) return NextResponse.json({ error: 'El código del plan estratégico debe tener la forma E1-K4 (E# = estrategia, K# = correlativo).' }, { status: 400 })
    const ancla = objetivoDe(code, ctx.objetivoDeDim)
    if (!ancla) return NextResponse.json({ error: `La estrategia ${code.split('-')[0]} no tiene una dimensión activa con un único objetivo: no se puede anclar.` }, { status: 409 })
    const { data: mismos } = await sb.from('strategic_plan_kpis').select('kpi_id').eq('cycle_id', ctx.ciclo.id).eq('strategic_code', code)
    if (((mismos ?? []) as { kpi_id: string }[]).some(r => r.kpi_id !== kpi.id)) return NextResponse.json({ error: `El código ${code} ya lo usa otro KPI del plan estratégico.` }, { status: 409 })
    const { data: ya } = await sb.from('strategic_plan_kpis').select('id').eq('cycle_id', ctx.ciclo.id).eq('kpi_id', kpi.id).limit(1)
    if ((ya ?? []).length) {
      const { error } = await sb.from('strategic_plan_kpis').update({ strategic_code: code, objective_id: ancla.id }).eq('cycle_id', ctx.ciclo.id).eq('kpi_id', kpi.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, code, objetivo: ancla.code })
    }
    const { error } = await sb.from('strategic_plan_kpis').insert({ cycle_id: ctx.ciclo.id, kpi_id: kpi.id, objective_id: ancla.id, strategic_code: code })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, code, objetivo: ancla.code })
  }

  // ── Efectividad ───────────────────────────────────────────────────────────
  if (b.plan !== 'efectividad') return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  if (!ctx.planEfec) return NextResponse.json({ error: 'No hay plan de efectividad cargado' }, { status: 409 })
  if (!b.on) {
    const { error } = await sb.from('effectiveness_plan_kpis').delete().eq('plan_id', ctx.planEfec.id).eq('kpi_id', kpi.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (!RE_EFEC.test(code)) return NextResponse.json({ error: 'El código del plan de efectividad debe tener la forma E1-S01 (E# = estrategia; I/O/S = institucional, operativo o estratégico; correlativo).' }, { status: 400 })
  const ancla = objetivoDe(code, ctx.objetivoDeDim)
  if (!ancla) return NextResponse.json({ error: `La estrategia ${code.split('-')[0]} no tiene una dimensión activa con un único objetivo: no se puede anclar.` }, { status: 409 })
  const { filas, migrado } = await enlacesEfectividad(sb, ctx.planEfec.id)
  if (!migrado) return NextResponse.json({ error: 'Falta correr la migración supabase/kpi_codigo_por_plan.sql (código por plan de efectividad).' }, { status: 409 })
  if (filas.some(r => norm(r.plan_code) === code && r.kpi_id !== kpi.id)) return NextResponse.json({ error: `El código ${code} ya lo usa otro KPI del plan de efectividad.` }, { status: 409 })
  const suyo = filas.find(r => r.kpi_id === kpi.id)
  if (suyo) {
    const { error } = await sb.from('effectiveness_plan_kpis').update({ plan_code: code, link_type: 'objetivo', link_id: ancla.id }).eq('id', suyo.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, code, objetivo: ancla.code })
  }
  const { error } = await sb.from('effectiveness_plan_kpis').insert({ plan_id: ctx.planEfec.id, kpi_id: kpi.id, link_type: 'objetivo', link_id: ancla.id, plan_code: code })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, code, objetivo: ancla.code })
}
