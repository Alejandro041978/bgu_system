import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'
import { etiquetaDe, anioVigente, type AcademicYear } from '@/lib/academic-year'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// INSTITUTIONAL ASSESSMENT PLAN — una sola ruta para las tres vistas.
//
// El plan sistémico, el tablero de medidas y el dashboard miran lo mismo desde
// ángulos distintos; servirlo desde una ruta evita que tres consultas parecidas
// se vayan separando con el tiempo y terminen contando cosas distintas.
// ---------------------------------------------------------------------------

/**
 * Los códigos del calendario se guardaron como texto porque el Apéndice A del
 * documento referencia medidas que su propia Tabla 4 no define (D-10, I-12,
 * I-13). Aquí se marca cuáles no existen, en vez de esconderlo.
 */
function revisarCodigos(codes: string[] | null, existentes: Set<string>): string[] {
  const malos: string[] = []
  for (const raw of codes ?? []) {
    const c = raw.trim()
    if (!c || c.toLowerCase() === 'todas') continue
    const rango = c.match(/^([A-Z]-\d{2})\.\.([A-Z]-\d{2})$/)
    if (rango) {
      if (!existentes.has(rango[1])) malos.push(rango[1])
      if (!existentes.has(rango[2])) malos.push(rango[2])
      continue
    }
    if (!existentes.has(c)) malos.push(c)
  }
  return [...new Set(malos)]
}

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const sb = db()

  const { data: anios } = await sb.from('academic_years')
    .select('id, name, start_date, end_date, status').order('start_date')
  const lista = (anios ?? []) as AcademicYear[]
  const pedido = req.nextUrl.searchParams.get('academic_year_id')
  const anio = (pedido ? lista.find(y => y.id === pedido) : null) ?? anioVigente(lista) ?? lista[lista.length - 1] ?? null

  // El IAP es ANUAL: hay un plan por año académico. Se elige el que cubre el
  // año consultado, no "el activo" — si no, al mirar 2026-2027 se verían las
  // medidas del plan de 2025-2026 con los resultados del año siguiente, que es
  // la peor mezcla posible: parece correcta.
  const { data: planes } = await sb.from('iap_plans')
    .select('id, name, version, doc_owner, status, start_academic_year_id, end_academic_year_id')
    .order('created_at')
  const fechaDe = (id: string | null) => lista.find(y => y.id === id)?.start_date ?? null
  const cubre = (p: { start_academic_year_id: string | null; end_academic_year_id: string | null }) => {
    if (!anio) return false
    const d = fechaDe(p.start_academic_year_id), h = fechaDe(p.end_academic_year_id) ?? fechaDe(p.start_academic_year_id)
    return !!d && !!h && d <= anio.start_date && anio.start_date <= h
  }
  const plan = (planes ?? []).find(cubre)
    ?? (planes ?? []).find((p: { status: string }) => p.status === 'active')
    ?? null
  if (!plan) return NextResponse.json({ error: 'No hay un Institutional Assessment Plan activo' }, { status: 409 })

  // Si el año que se mira no es el que cubre el plan, hay que decirlo.
  const planCubreElAnio = cubre(plan)

  const [{ data: medidas }, { data: alin }, { data: bench }, { data: cal }, { data: objs }] = await Promise.all([
    sb.from('iap_measures').select('*').eq('plan_id', plan.id).order('code'),
    sb.from('iap_measure_objectives').select('measure_id, objective_id'),
    sb.from('iap_benchmarks').select('measure_id, scope, value, operator, note'),
    sb.from('iap_calendar').select('*').eq('plan_id', plan.id).order('seq'),
    sb.from('strategic_objectives').select('id, code, name, status').eq('status', 'active').order('code'),
  ])

  const indIds = (medidas ?? []).map((m: { indicator_id: string | null }) => m.indicator_id).filter(Boolean)
  const { data: cat } = indIds.length
    ? await sb.from('effectiveness_kpis').select('id, code, name, source, value_type, formula_type').in('id', indIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catPorId = new Map<string, any>((cat ?? []).map((k: { id: string }) => [k.id, k]))

  const resultados = new Map<string, number>()
  if (anio && indIds.length) {
    const { data: rs } = await sb.from('indicator_results')
      .select('indicator_id, value').eq('academic_year_id', anio.id).eq('period', 'anual').in('indicator_id', indIds)
    for (const r of rs ?? []) resultados.set(r.indicator_id, Number(r.value))
  }

  const objPorId = new Map<string, { id: string; code: string; name: string }>(
    (objs ?? []).map((o: { id: string; code: string; name: string }) => [o.id, o]))
  const objsDeMedida = new Map<string, string[]>()
  const medidasDeObj = new Map<string, string[]>()
  for (const a of alin ?? []) {
    const o = objPorId.get(a.objective_id); if (!o) continue
    if (!objsDeMedida.has(a.measure_id)) objsDeMedida.set(a.measure_id, [])
    objsDeMedida.get(a.measure_id)!.push(o.code)
    if (!medidasDeObj.has(a.objective_id)) medidasDeObj.set(a.objective_id, [])
    medidasDeObj.get(a.objective_id)!.push(a.measure_id)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const benchDe = new Map<string, any[]>()
  for (const b of bench ?? []) {
    if (!benchDe.has(b.measure_id)) benchDe.set(b.measure_id, [])
    benchDe.get(b.measure_id)!.push({ scope: b.scope, value: Number(b.value), operator: b.operator, note: b.note })
  }

  const salida = (medidas ?? []).map((m: {
    id: string; code: string; name: string; measure_type: string; frequency: string | null
    collection_window: string | null; responsible_unit: string | null; data_source: string | null
    indicator_id: string | null
  }) => {
    const ind = m.indicator_id ? catPorId.get(m.indicator_id) : null
    const resultado = m.indicator_id && resultados.has(m.indicator_id) ? resultados.get(m.indicator_id)! : null
    const bs = (benchDe.get(m.id) ?? []).sort((a, b) => a.scope.localeCompare(b.scope))
    const general = bs.find(b => b.scope === 'general')
    const cumple = resultado === null || !general ? null
      : general.operator === '<=' ? resultado <= general.value : resultado >= general.value
    return {
      id: m.id, code: m.code, name: m.name, tipo: m.measure_type,
      frecuencia: m.frequency, ventana: m.collection_window,
      unidad: m.responsible_unit, fuente_dato: m.data_source,
      objetivos: (objsDeMedida.get(m.id) ?? []).sort(),
      benchmarks: bs,
      indicador: ind ? { id: ind.id, code: String(ind.code ?? '').trim(), name: ind.name, source: ind.source } : null,
      resultado, cumple,
    }
  })

  const codigos = new Set<string>(salida.map((m: { code: string }) => m.code))
  const calendario = (cal ?? []).map((c: {
    seq: number; period_label: string; activity: string; measure_codes: string[] | null; responsible: string | null
  }) => ({
    seq: c.seq, periodo: c.period_label, actividad: c.activity,
    medidas: c.measure_codes ?? [], responsable: c.responsible,
    desconocidas: revisarCodigos(c.measure_codes, codigos),
  }))

  // Los siete objetivos institucionales del documento son O1-O7. O8 y O9
  // existen en el plan estratégico y el IAP todavía no los contempla: se
  // devuelven aparte en vez de mezclarlos, que es la decisión pendiente.
  const porObjetivo = (objs ?? []).map((o: { id: string; code: string; name: string }) => ({
    code: o.code, name: o.name,
    del_iap: ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7'].includes(o.code),
    medidas: (medidasDeObj.get(o.id) ?? [])
      .map(id => salida.find((m: { id: string }) => m.id === id))
      .filter(Boolean)
      .map((m) => (m as { code: string }).code).sort(),
  }))

  const conFuente = salida.filter((m: { indicador: unknown }) => m.indicador)
  return NextResponse.json({
    plan: {
      name: plan.name, version: plan.version, doc_owner: plan.doc_owner,
      desde: lista.find(y => y.id === plan.start_academic_year_id)?.name ?? null,
      hasta: lista.find(y => y.id === plan.end_academic_year_id)?.name ?? null,
      cubre_el_anio: planCubreElAnio,
    },
    anio: anio ? { id: anio.id, etiqueta: etiquetaDe(anio), start_date: anio.start_date, end_date: anio.end_date } : null,
    anios: lista.map(y => ({ id: y.id, etiqueta: etiquetaDe(y) })),
    cobertura: {
      medidas: salida.length,
      directas: salida.filter((m: { tipo: string }) => m.tipo === 'directa').length,
      indirectas: salida.filter((m: { tipo: string }) => m.tipo === 'indirecta').length,
      con_fuente: conFuente.length,
      sin_fuente: salida.length - conFuente.length,
      con_resultado: salida.filter((m: { resultado: number | null }) => m.resultado !== null).length,
      cumplen: salida.filter((m: { cumple: boolean | null }) => m.cumple === true).length,
      no_cumplen: salida.filter((m: { cumple: boolean | null }) => m.cumple === false).length,
      calendario_con_codigos_rotos: calendario.filter((c: { desconocidas: string[] }) => c.desconocidas.length).length,
    },
    objetivos: porObjetivo,
    medidas: salida,
    calendario,
  })
}
