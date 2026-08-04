import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'
import { etiquetaDe, anioVigente, type AcademicYear } from '@/lib/academic-year'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// TABLERO DE INDICADORES DEL PLAN ESTRATÉGICO
//
// El plan ya tenía sus indicadores, pero se administraban desde el Plan de
// Efectividad y se veían agrupados por plan. Agrupados así no contestan la
// pregunta que importa: ¿qué objetivo está medido y cuál no?
//
// Esta ruta arma el árbol del ciclo vigente (dimensión → objetivo) y le cuelga
// los indicadores que apuntan a cada objetivo o a sus acciones. Lo que sale
// vacío es un objetivo que el plan declara y nadie mide — que es exactamente
// lo que una acreditadora busca primero.
// ---------------------------------------------------------------------------

interface Indicador {
  id: string; code: string; name: string; level: string
  value_type: string; frequency: string; source: string
  meta: number | null; meta_operator: string
  benchmark: number | null; benchmark_operator: string
  resultado: number | null; resultado_at: string | null
  responsable: string | null
  origen: 'objetivo' | 'accion'
  origen_nombre: string | null
}

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const sb = db()
  const pedido = req.nextUrl.searchParams.get('academic_year_id')

  // ── Ciclo vigente ────────────────────────────────────────────────────────
  const { data: ciclo } = await sb.from('strategic_plan_cycles')
    .select('id, name, start_year, end_year')
    .eq('status', 'active').order('created_at').limit(1).maybeSingle()
  if (!ciclo) return NextResponse.json({ error: 'No hay un ciclo estratégico activo' }, { status: 409 })

  const { data: anios } = await sb.from('academic_years')
    .select('id, name, start_date, end_date, status').order('start_date')
  const lista = (anios ?? []) as AcademicYear[]
  const anio = (pedido ? lista.find(y => y.id === pedido) : null) ?? anioVigente(lista) ?? lista[lista.length - 1] ?? null

  // ── Árbol vigente ────────────────────────────────────────────────────────
  const { data: dims } = await sb.from('strategic_dimensions')
    .select('id, code, name').eq('cycle_id', ciclo.id).eq('status', 'active').order('code')
  const dimIds = (dims ?? []).map((d: { id: string }) => d.id)

  const { data: objs } = dimIds.length
    ? await sb.from('strategic_objectives').select('id, code, name, dimension_id')
        .in('dimension_id', dimIds).eq('status', 'active').order('code')
    : { data: [] }
  const objIds = (objs ?? []).map((o: { id: string }) => o.id)

  // Acciones: se llega por estrategias, y los indicadores pueden apuntar tanto
  // a la acción como al responsable de la acción.
  const { data: strats } = objIds.length
    ? await sb.from('strategic_strategies').select('id, objective_id').in('objective_id', objIds).eq('status', 'active')
    : { data: [] }
  const stratIds = (strats ?? []).map((s: { id: string }) => s.id)
  const objDeStrat = new Map<string, string>((strats ?? []).map((s: { id: string; objective_id: string }) => [s.id, s.objective_id]))

  const { data: acts } = stratIds.length
    ? await sb.from('strategic_actions').select('id, code, name, strategy_id').in('strategy_id', stratIds).eq('status', 'active')
    : { data: [] }
  const actIds = (acts ?? []).map((a: { id: string }) => a.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actPorId = new Map<string, any>((acts ?? []).map((a: { id: string }) => [a.id, a]))

  const { data: resps } = actIds.length
    ? await sb.from('strategic_action_responsibles').select('id, action_id').in('action_id', actIds)
    : { data: [] }
  const accionDeResp = new Map<string, string>((resps ?? []).map((r: { id: string; action_id: string }) => [r.id, r.action_id]))

  // ── Indicadores y sus enlaces ────────────────────────────────────────────
  const { data: enlaces } = await sb.from('effectiveness_plan_kpis')
    .select('id, kpi_id, link_type, link_id, meta, meta_operator, responsible_id, resultado, resultado_updated_at')
  const { data: cat } = await sb.from('effectiveness_kpis').select('*')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catPorId = new Map<string, any>((cat ?? []).map((k: { id: string }) => [k.id, k]))

  // Resultados del año: viven en indicator_results desde el Paso 1. Si el SQL
  // todavía no corrió, se cae al resultado viejo del enlace en vez de romper.
  const resultados = new Map<string, { value: number; at: string | null }>()
  let migrado = true
  if (anio) {
    const { data: rs, error } = await sb.from('indicator_results')
      .select('indicator_id, value, recorded_at, period')
      .eq('academic_year_id', anio.id).eq('period', 'anual')
    if (error) migrado = false
    else for (const r of rs ?? []) resultados.set(r.indicator_id, { value: Number(r.value), at: r.recorded_at })
  }

  const { data: emps } = await sb.from('hr_employees').select('id, full_name')
  const nombreEmp = new Map<string, string>((emps ?? []).map(
    (e: { id: string; full_name: string }) => [e.id, e.full_name]))

  // Cada enlace se resuelve al OBJETIVO al que pertenece, suba por donde suba.
  const porObjetivo = new Map<string, Indicador[]>()
  for (const e of enlaces ?? []) {
    const k = catPorId.get(e.kpi_id)
    if (!k) continue

    let objetivoId: string | null = null
    let origen: 'objetivo' | 'accion' = 'objetivo'
    let origenNombre: string | null = null

    if (e.link_type === 'objetivo') {
      objetivoId = e.link_id
    } else {
      const accionId = e.link_type === 'accion_responsable' ? accionDeResp.get(e.link_id) ?? null : e.link_id
      const accion = accionId ? actPorId.get(accionId) : null
      if (accion) {
        objetivoId = objDeStrat.get(accion.strategy_id) ?? null
        origen = 'accion'
        origenNombre = `${accion.code} · ${accion.name}`
      }
    }
    if (!objetivoId) continue

    const res = resultados.get(e.kpi_id)
    const ind: Indicador = {
      id: k.id, code: (k.code ?? '').trim(), name: k.name, level: k.level,
      value_type: k.value_type, frequency: k.frequency, source: k.source ?? 'manual',
      meta: e.meta === null ? null : Number(e.meta), meta_operator: e.meta_operator ?? '>=',
      benchmark: k.benchmark === null || k.benchmark === undefined ? null : Number(k.benchmark),
      benchmark_operator: k.benchmark_operator ?? '>=',
      resultado: res ? res.value : (migrado ? null : (e.resultado === null ? null : Number(e.resultado))),
      resultado_at: res ? res.at : (migrado ? null : e.resultado_updated_at),
      responsable: e.responsible_id ? nombreEmp.get(e.responsible_id) ?? null : null,
      origen, origen_nombre: origenNombre,
    }
    if (!porObjetivo.has(objetivoId)) porObjetivo.set(objetivoId, [])
    porObjetivo.get(objetivoId)!.push(ind)
  }

  // ── Armado del árbol ─────────────────────────────────────────────────────
  const objPorDim = new Map<string, { id: string; code: string; name: string }[]>()
  for (const o of objs ?? []) {
    if (!objPorDim.has(o.dimension_id)) objPorDim.set(o.dimension_id, [])
    objPorDim.get(o.dimension_id)!.push(o)
  }

  const arbol = (dims ?? []).map((d: { id: string; code: string; name: string }) => ({
    id: d.id, code: d.code, name: d.name,
    objetivos: (objPorDim.get(d.id) ?? []).map(o => {
      const inds = (porObjetivo.get(o.id) ?? []).sort((a, b) => a.code.localeCompare(b.code))
      return { id: o.id, code: o.code, name: o.name, indicadores: inds }
    }),
  }))

  // ── Cobertura: la pregunta que el tablero existe para contestar ──────────
  const todos = [...porObjetivo.values()].flat()
  const objetivosTotales = (objs ?? []).length
  const objetivosMedidos = [...porObjetivo.keys()].filter(id => (porObjetivo.get(id) ?? []).length).length

  return NextResponse.json({
    ciclo: { id: ciclo.id, name: ciclo.name, start_year: ciclo.start_year, end_year: ciclo.end_year },
    anio: anio ? { id: anio.id, etiqueta: etiquetaDe(anio), start_date: anio.start_date, end_date: anio.end_date } : null,
    anios: lista.map(y => ({ id: y.id, etiqueta: etiquetaDe(y) })),
    migrado,
    cobertura: {
      objetivos: objetivosTotales,
      objetivos_medidos: objetivosMedidos,
      objetivos_sin_medir: objetivosTotales - objetivosMedidos,
      indicadores: todos.length,
      con_meta: todos.filter(i => i.meta !== null).length,
      con_resultado: todos.filter(i => i.resultado !== null).length,
      automaticos: todos.filter(i => i.source === 'formula').length,
    },
    dimensiones: arbol,
  })
}
