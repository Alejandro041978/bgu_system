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
  // Se elige un PLAN, no un año (corrección del usuario, 17/09/2026). Antes se
  // elegía cualquier año académico y, si no tenía plan, se mostraba "prestada"
  // la estructura de otro: parecía un plan y no lo era. Ahora solo existen los
  // planes creados; el año es el del plan elegido.
  const { data: planesRaw } = await sb.from('iap_plans')
    .select('id, name, version, doc_owner, status, start_academic_year_id, end_academic_year_id, created_at')
    .order('created_at')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planes = ((planesRaw ?? []) as any[])
    .map(p => ({ ...p, _inicio: lista.find(y => y.id === p.start_academic_year_id)?.start_date ?? '' }))
    .sort((x, y) => String(y._inicio).localeCompare(String(x._inicio)))
  const vigente = anioVigente(lista)
  const pedido = req.nextUrl.searchParams.get('plan_id')
  const plan = (pedido ? planes.find(p => p.id === pedido) : null)
    ?? planes.find(p => vigente && p.start_academic_year_id === vigente.id)
    ?? planes[0] ?? null
  const { data: cuentaMed } = await sb.from('iap_measures').select('plan_id')
  const nMedidas = new Map<string, number>()
  for (const m of cuentaMed ?? []) nMedidas.set(String(m.plan_id), (nMedidas.get(String(m.plan_id)) ?? 0) + 1)
  const planesOut = planes.map(p => ({
    id: p.id, name: p.name,
    anio: (() => { const y = lista.find(x => x.id === p.start_academic_year_id); return y ? etiquetaDe(y) : null })(),
    medidas: nMedidas.get(String(p.id)) ?? 0,
  }))
  const aniosSinPlan = lista
    .filter(y => !planes.some(p => p.start_academic_year_id === y.id))
    .map(y => ({ id: y.id, etiqueta: etiquetaDe(y) }))
  if (!plan) return NextResponse.json({ sin_planes: true, planes: [], anios_sin_plan: aniosSinPlan })
  const anio = lista.find(y => y.id === plan.start_academic_year_id) ?? null
  const planCubreElAnio = true

  const [{ data: medidas }, { data: alin }, { data: bench }, { data: cal }, { data: objs }, { data: evid }, { data: escala }, { data: emps }] = await Promise.all([
    sb.from('iap_measures').select('*').eq('plan_id', plan.id).order('code'),
    sb.from('iap_measure_objectives').select('measure_id, objective_id'),
    sb.from('iap_benchmarks').select('measure_id, scope, value, operator, note'),
    sb.from('iap_calendar').select('*').eq('plan_id', plan.id).order('seq'),
    sb.from('strategic_objectives').select('id, code, name, status').eq('status', 'active').order('code'),
    sb.from('iap_measure_evidence').select('measure_id, label, url').order('label'),
    sb.from('assessment_status_catalog').select('*').order('seq'),
    sb.from('hr_employees').select('id, full_name'),
  ])
  const nombreEmp = new Map<string, string>((emps ?? []).map((e: { id: string; full_name: string }) => [e.id, e.full_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidDe = new Map<string, any[]>()
  for (const e of evid ?? []) {
    if (!evidDe.has(e.measure_id)) evidDe.set(e.measure_id, [])
    evidDe.get(e.measure_id)!.push({ label: e.label, url: e.url })
  }

  const indIds = (medidas ?? []).map((m: { indicator_id: string | null }) => m.indicator_id).filter(Boolean)
  const { data: cat } = indIds.length
    ? await sb.from('effectiveness_kpis').select('id, code, name, source, value_type, formula_type').in('id', indIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catPorId = new Map<string, any>((cat ?? []).map((k: { id: string }) => [k.id, k]))

  // ── Cruces NAVEGABLES medida→KPI (16/09/2026): la tabla iap_measure_kpis
  // reemplaza a los códigos en texto como fuente de la navegación (el texto
  // queda como constancia del documento). La pertenencia estratégica y su
  // alias (E1-K1) se DERIVAN del enlace del propio KPI al plan estratégico —
  // sin nomenclatura paralela que mantener. Si la migración no corrió, las
  // vistas caen a los textos como siempre.
  const kpisDeMedida = new Map<string, { code: string; name: string; estrategico: boolean; alias: string | null }[]>()
  try {
    const { data: links } = await sb.from('iap_measure_kpis').select('measure_id, kpi_id')
    if (links?.length) {
      const kpiIds = [...new Set(links.map((l: { kpi_id: string }) => String(l.kpi_id)))]
      const { data: kcat } = await sb.from('effectiveness_kpis').select('id, code, name').in('id', kpiIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kPorId = new Map<string, any>((kcat ?? []).map((k: { id: string }) => [String(k.id), k]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { data: spk } = await sb.from('strategic_plan_kpis').select('kpi_id, strategic_code') as any
      if (!spk) ({ data: spk } = await sb.from('strategic_plan_kpis').select('kpi_id'))
      const aliasDe = new Map<string, string | null>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (spk ?? []) as any[]) aliasDe.set(String(s.kpi_id), s.strategic_code ?? null)
      for (const l of links as { measure_id: string; kpi_id: string }[]) {
        const k = kPorId.get(String(l.kpi_id))
        if (!k) continue
        if (!kpisDeMedida.has(String(l.measure_id))) kpisDeMedida.set(String(l.measure_id), [])
        kpisDeMedida.get(String(l.measure_id))!.push({
          code: String(k.code ?? '').trim(), name: k.name,
          estrategico: aliasDe.has(String(l.kpi_id)),
          alias: aliasDe.get(String(l.kpi_id)) ?? null,
        })
      }
      for (const v of kpisDeMedida.values()) v.sort((a, b) => a.code.localeCompare(b.code))
    }
  } catch { /* migración sin correr: navegación por textos */ }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salida = (medidas ?? []).map((m: any) => {
    const ind = m.indicator_id ? catPorId.get(m.indicator_id) : null
    // El número del ERP para ese indicador, si existe. Se devuelve aparte del
    // reportado: cuando difieren, alguien tiene que mirar cuál vale.
    const delErp = m.indicator_id && resultados.has(m.indicator_id) ? resultados.get(m.indicator_id)! : null
    const reportado = m.result_value === null || m.result_value === undefined ? null : Number(m.result_value)
    const bs = (benchDe.get(m.id) ?? []).sort((a, b) => a.scope.localeCompare(b.scope))
    return {
      id: m.id, code: m.code, name: m.name, tipo: m.measure_type,
      frecuencia: m.frequency, ventana: m.collection_window,
      unidad: m.responsible_unit, fuente_dato: m.data_source,
      proposito: m.purpose, dato_minimo: m.minimum_data, evidencia_esperada: m.expected_evidence,
      tipo_cruce: m.cross_type, sin_cruce: m.no_cross_note, uso_esperado: m.expected_use,
      kpis_efectividad: m.effectiveness_kpi_codes ?? [], kpis_estrategicos: m.strategic_kpi_codes ?? [],
      kpis: kpisDeMedida.get(String(m.id)) ?? [],
      objetivos: (objsDeMedida.get(m.id) ?? []).sort(),
      benchmarks: bs,
      binding: m.source_binding ?? 'pendiente',
      meta_texto: m.target_text, meta_valor: m.target_value === null ? null : Number(m.target_value),
      meta_operador: m.target_operator ?? '>=',
      responsable: m.owner_employee_id ? nombreEmp.get(m.owner_employee_id) ?? m.owner_label : m.owner_label,
      resultado: reportado, resultado_texto: m.result_text,
      estado: m.result_status as string | null,
      resultado_erp: delErp,
      discrepa: reportado !== null && delErp !== null && Math.abs(reportado - delErp) > 0.005,
      decision: m.decision,
      evidencias: evidDe.get(m.id) ?? [],
      indicador: ind ? { id: ind.id, code: String(ind.code ?? '').trim(), name: ind.name, source: ind.source } : null,
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

  // Vincular KPI: solo los que el Catálogo de KPIs declara del plan de
  // evaluación (ya tienen su código D-/I- en algún plan) y que aún no están en
  // ESTE plan. Un KPI entra una sola vez por plan.
  const { data: todas } = await sb.from('iap_measures')
    .select('indicator_id, code, name, measure_type, created_at').not('indicator_id', 'is', null).order('created_at')
  const enEste = new Set<string>((medidas ?? []).map((m: { indicator_id: string | null }) => String(m.indicator_id)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ultimaDe = new Map<string, any>()
  for (const m of todas ?? []) ultimaDe.set(String(m.indicator_id), m)
  const disponibles = [...ultimaDe.values()]
    .filter(m => !enEste.has(String(m.indicator_id)))
    .map(m => ({ indicator_id: m.indicator_id, code: m.code, name: m.name, tipo: m.measure_type }))
    .sort((x, y) => String(x.code).localeCompare(String(y.code)))

  const cuenta = (e: string) => salida.filter((m: { estado: string | null }) => m.estado === e).length
  return NextResponse.json({
    escala: escala ?? [],
    planes: planesOut,
    anios_sin_plan: aniosSinPlan,
    disponibles,
    plan: {
      id: plan.id,
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
      // "del ERP" es el binding del año, no una propiedad fija del indicador:
      // el año que viene esta cifra debería subir sin que cambie el modelo.
      del_erp: salida.filter((m: { binding: string }) => m.binding === 'erp_formula').length,
      externos: salida.filter((m: { binding: string }) => m.binding === 'externo').length,
      pendientes: salida.filter((m: { binding: string }) => m.binding === 'pendiente').length,
      con_resultado: salida.filter((m: { estado: string | null }) => m.estado !== null).length,
      con_evidencia: salida.filter((m: { evidencias: unknown[] }) => m.evidencias.length).length,
      cumplidos: cuenta('cumplido'), parciales: cuenta('parcial'), no_cumplidos: cuenta('no_cumplido'),
      sin_datos: cuenta('sin_datos'), no_aplicables: cuenta('no_aplicable'),
      discrepancias: salida.filter((m: { discrepa: boolean }) => m.discrepa).length,
      calendario_con_codigos_rotos: calendario.filter((c: { desconocidas: string[] }) => c.desconocidas.length).length,
    },
    objetivos: porObjetivo,
    medidas: salida,
    calendario,
  })
}

// POST — gestión del plan, igual que Cargar Plan · Efectividad:
//   { action: 'crear_plan', academic_year_id }
//   { action: 'vincular', plan_id, indicator_id }
//   { action: 'desvincular', measure_id }
export async function POST(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado
  const sb = db()
  const b = await req.json().catch(() => null) as
    { action?: string; academic_year_id?: string; plan_id?: string; indicator_id?: string; measure_id?: string } | null

  if (b?.action === 'crear_plan') {
    if (!b.academic_year_id) return NextResponse.json({ error: 'Falta el año académico' }, { status: 400 })
    const { data: y } = await sb.from('academic_years').select('id, name, start_date, end_date, status').eq('id', b.academic_year_id).maybeSingle()
    if (!y) return NextResponse.json({ error: 'Año académico no encontrado' }, { status: 400 })
    const { data: ya } = await sb.from('iap_plans').select('id').eq('start_academic_year_id', y.id).limit(1)
    if ((ya ?? []).length) return NextResponse.json({ error: 'Ese año académico ya tiene su plan de evaluación.' }, { status: 409 })
    const { data: prev } = await sb.from('iap_plans').select('doc_owner').order('created_at', { ascending: false }).limit(1)
    const { data: nuevo, error } = await sb.from('iap_plans').insert({
      name: 'Institutional Assessment Plan ' + etiquetaDe(y as AcademicYear), version: '1.0',
      start_academic_year_id: y.id, end_academic_year_id: y.id,
      doc_owner: prev?.[0]?.doc_owner ?? null, status: 'active',
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, plan_id: nuevo.id })
  }

  if (b?.action === 'vincular') {
    if (!b.plan_id || !b.indicator_id) return NextResponse.json({ error: 'Faltan plan_id e indicator_id' }, { status: 400 })
    const { data: ya } = await sb.from('iap_measures').select('id').eq('plan_id', b.plan_id).eq('indicator_id', b.indicator_id).limit(1)
    if ((ya ?? []).length) return NextResponse.json({ error: 'Este KPI ya está vinculado a este plan.' }, { status: 409 })
    // La ficha nace copiando la DEFINICIÓN de la más reciente (decisión del
    // usuario): código, propósito, meta, responsable, origen. El resultado, el
    // estado, la decisión y la evidencia son del año y NO viajan.
    const { data: prevs } = await sb.from('iap_measures').select('*').eq('indicator_id', b.indicator_id).order('created_at', { ascending: false }).limit(1)
    const o = prevs?.[0]
    if (!o) return NextResponse.json({ error: 'Este KPI no está declarado del plan de evaluación. Márcalo primero en el Catálogo de KPIs, donde recibe su código (D-## / I-##).' }, { status: 409 })
    const definicion: Record<string, unknown> = { ...o }
    for (const k of ['id', 'created_at', 'plan_id', 'result_value', 'result_text', 'result_status', 'decision', 'result_note', 'result_recorded_at', 'result_recorded_by']) delete definicion[k]
    const { data: nueva, error } = await sb.from('iap_measures').insert({ ...definicion, plan_id: b.plan_id }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data: bs } = await sb.from('iap_benchmarks').select('scope, value, operator, note').eq('measure_id', o.id)
    if ((bs ?? []).length) {
      await sb.from('iap_benchmarks').insert((bs ?? []).map((x: Record<string, unknown>) => ({ ...x, measure_id: nueva.id })))
    }
    return NextResponse.json({ ok: true, measure_id: nueva.id })
  }

  if (b?.action === 'desvincular') {
    if (!b.measure_id) return NextResponse.json({ error: 'Falta measure_id' }, { status: 400 })
    const { data: m } = await sb.from('iap_measures').select('id, code, result_value, result_status').eq('id', b.measure_id).maybeSingle()
    if (!m) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (m.result_value !== null || m.result_status !== null) {
      return NextResponse.json({ error: m.code + ' ya tiene un resultado registrado en este plan: no se puede quitar.' }, { status: 409 })
    }
    const { data: ev } = await sb.from('iap_measure_evidence').select('id').eq('measure_id', m.id).limit(1)
    if ((ev ?? []).length) return NextResponse.json({ error: m.code + ' tiene evidencia cargada en este plan: no se puede quitar.' }, { status: 409 })
    await sb.from('iap_benchmarks').delete().eq('measure_id', m.id)
    await sb.from('iap_measure_objectives').delete().eq('measure_id', m.id)
    const { error } = await sb.from('iap_measures').delete().eq('id', m.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
