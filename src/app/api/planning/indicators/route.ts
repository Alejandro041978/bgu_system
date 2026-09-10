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
  // Vigencia por años académicos (10/09/2026): null = extremo abierto (rige
  // toda la vigencia del ciclo por ese lado). El año final es INCLUSIVE.
  vigencia_desde: { id: string; etiqueta: string } | null
  vigencia_hasta: { id: string; etiqueta: string } | null
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

  // ── Vigencia por años académicos de cada KPI en el plan (10/09/2026) ─────
  // Sin años: rige todo el ciclo. Con inicio: desde ese año en adelante. Con
  // final: hasta ese año INCLUSIVE. Se compara por la fecha de inicio del año
  // académico. Un KPI fuera de vigencia en el año seleccionado no aparece en
  // ese año (sí en los años en que regía).
  const { data: spkRows } = await sb.from('strategic_plan_kpis')
    .select('kpi_id, valid_from_year_id, valid_to_year_id').eq('cycle_id', ciclo.id)
  const inicioDeAnio = new Map<string, string>(lista.map(y => [String(y.id), String(y.start_date)]))
  const etiquetaDeAnio = new Map<string, string>(lista.map(y => [String(y.id), etiquetaDe(y)]))
  const vigenciaDeKpi = new Map<string, { desde: string | null; hasta: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (spkRows ?? []) as any[]) {
    const prev = vigenciaDeKpi.get(String(r.kpi_id)) ?? { desde: null, hasta: null }
    // Con varias filas del mismo KPI (varios objetivos), la vigencia es una
    // sola: gana el valor definido.
    vigenciaDeKpi.set(String(r.kpi_id), {
      desde: prev.desde ?? (r.valid_from_year_id ? String(r.valid_from_year_id) : null),
      hasta: prev.hasta ?? (r.valid_to_year_id ? String(r.valid_to_year_id) : null),
    })
  }
  const vigenteEnAnio = (kpiId: string): boolean => {
    if (!anio) return true
    const v = vigenciaDeKpi.get(kpiId)
    if (!v) return true
    const ini = String(anio.start_date)
    if (v.desde && ini < (inicioDeAnio.get(v.desde) ?? '')) return false
    if (v.hasta && ini > (inicioDeAnio.get(v.hasta) ?? '9999')) return false
    return true
  }

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
    if (!vigenteEnAnio(String(e.kpi_id))) continue

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
      vigencia_desde: (() => {
        const v = vigenciaDeKpi.get(String(e.kpi_id))
        return v?.desde ? { id: v.desde, etiqueta: etiquetaDeAnio.get(v.desde) ?? '?' } : null
      })(),
      vigencia_hasta: (() => {
        const v = vigenciaDeKpi.get(String(e.kpi_id))
        return v?.hasta ? { id: v.hasta, etiqueta: etiquetaDeAnio.get(v.hasta) ?? '?' } : null
      })(),
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

// PATCH { kpi_id, objective_id?, valid_from_year_id|null, valid_to_year_id|null }
// Fija la vigencia del KPI dentro del plan estratégico (ciclo activo). Ambos
// extremos inclusive; null = extremo abierto. Si el KPI aún no tiene fila de
// pertenencia al plan, se crea con el objetivo indicado.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado
  const sb = db()
  const b = await req.json().catch(() => null) as
    { kpi_id?: string; objective_id?: string; valid_from_year_id?: string | null; valid_to_year_id?: string | null } | null
  if (!b?.kpi_id) return NextResponse.json({ error: 'Falta kpi_id' }, { status: 400 })

  const { data: ciclo } = await sb.from('strategic_plan_cycles')
    .select('id').eq('status', 'active').order('created_at').limit(1).maybeSingle()
  if (!ciclo) return NextResponse.json({ error: 'No hay un ciclo estratégico activo' }, { status: 409 })

  const desde = b.valid_from_year_id || null
  const hasta = b.valid_to_year_id || null
  if (desde && hasta) {
    const { data: ys } = await sb.from('academic_years').select('id, start_date').in('id', [desde, hasta])
    const ini = (ys ?? []).find((y: { id: string }) => String(y.id) === desde)?.start_date
    const fin = (ys ?? []).find((y: { id: string }) => String(y.id) === hasta)?.start_date
    if (!ini || !fin) return NextResponse.json({ error: 'Año académico no encontrado' }, { status: 400 })
    if (ini > fin) return NextResponse.json({ error: 'El año de inicio no puede ser posterior al año final.' }, { status: 400 })
  }

  const { data: filas } = await sb.from('strategic_plan_kpis')
    .select('id').eq('cycle_id', ciclo.id).eq('kpi_id', b.kpi_id)
  if ((filas ?? []).length) {
    const { error } = await sb.from('strategic_plan_kpis')
      .update({ valid_from_year_id: desde, valid_to_year_id: hasta })
      .eq('cycle_id', ciclo.id).eq('kpi_id', b.kpi_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (!b.objective_id) return NextResponse.json({ error: 'El KPI no pertenece aún al plan: falta objective_id para crearle la pertenencia.' }, { status: 400 })
    const { error } = await sb.from('strategic_plan_kpis')
      .insert({ cycle_id: ciclo.id, kpi_id: b.kpi_id, objective_id: b.objective_id, valid_from_year_id: desde, valid_to_year_id: hasta })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
