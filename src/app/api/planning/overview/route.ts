import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { estadoDe, SEVERIDAD, type Estado } from '@/lib/indicator-status'
import fs from 'fs'
import path from 'path'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// La dimensión de cada indicador la fija el catálogo consolidado que aprobó
// Planeamiento. Si un indicador no está en él —el que nació de la fusión—, se
// deduce del prefijo del código, que es la misma clasificación.
const DIMENSIONES: Record<string, string> = {
  E1: 'Portafolio Académico', E2: 'Claustro Académico', E3: 'Capital humano administrativo',
  E4: 'Plataformas Tecnológicas', E5: 'Posicionamiento Global', E6: 'Cultura Universitaria',
  E7: 'Apoyo Económico y Acceso', D: 'Assessment · Medidas Directas', I: 'Assessment · Medidas Indirectas',
}
function catalogo(): Map<string, { dimname: string; formula: string }> {
  try {
    const p = path.join(process.cwd(), 'supabase', 'kpis_consolidados_56.json')
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Map((j.indicadores as any[]).map(c => [String(c.cod).trim().toUpperCase(), { dimname: c.dimname, formula: c.formula ?? '' }]))
  } catch { return new Map() }
}

// ---------------------------------------------------------------------------
// Panorama institucional de planeamiento.
//
// Un solo lugar donde ver los tres planes, leyendo el dato vivo del ERP en vez
// de un Excel. El estado no se guarda: se calcula igual para los tres, con la
// meta y el resultado del año académico en curso.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  const [{ data: anios }, { data: kpis }, { data: pe }, { data: ef }, { data: iap }, { data: tg }, { data: rs }, { data: emp }] =
    await Promise.all([
      sb.from('academic_years').select('id, name, start_date, end_date').order('start_date'),
      sb.from('effectiveness_kpis').select('id, code, name, unit, formula'),
      sb.from('strategic_plan_kpis').select('kpi_id, owner_label, responsible_id'),
      sb.from('effectiveness_plan_kpis').select('kpi_id, responsible_unit, responsible_id, decision'),
      sb.from('iap_measures').select('id, code, name, indicator_id, target_value, target_operator, target_text, result_value, result_status, owner_label, responsible_unit, decision'),
      sb.from('indicator_targets').select('indicator_id, academic_year_id, value, operator'),
      sb.from('indicator_results').select('indicator_id, academic_year_id, period, value'),
      sb.from('hr_employees').select('id, first_name, last_name'),
    ])

  const hoy = new Date().toISOString().slice(0, 10)
  const pedido = req.nextUrl.searchParams.get('anio')
  const anio = (anios ?? []).find((a: { id: string }) => a.id === pedido)
    ?? (anios ?? []).find((a: { start_date: string; end_date: string }) => a.start_date <= hoy && hoy <= a.end_date)
    ?? (anios ?? [])[anios.length - 1]

  const cat = catalogo()
  const nombreEmp = new Map((emp ?? []).map((e: { id: string; first_name: string; last_name: string }) =>
    [e.id, [e.first_name, e.last_name].filter(Boolean).join(' ')]))
  const enPE = new Map((pe ?? []).map((x: { kpi_id: string }) => [x.kpi_id, x]))
  const enEF = new Map((ef ?? []).map((x: { kpi_id: string }) => [x.kpi_id, x]))
  const enEV = new Map<string, unknown[]>()
  for (const m of iap ?? []) if (m.indicator_id) {
    if (!enEV.has(m.indicator_id)) enEV.set(m.indicator_id, [])
    enEV.get(m.indicator_id)!.push(m)
  }

  const metaDe = (id: string) => (tg ?? []).find((t: { indicator_id: string; academic_year_id: string }) =>
    t.indicator_id === id && t.academic_year_id === anio.id)
  const resDe = (id: string) => (rs ?? []).find((r: { indicator_id: string; academic_year_id: string; period: string }) =>
    r.indicator_id === id && r.academic_year_id === anio.id && r.period === 'anual')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas: any[] = []

  for (const k of kpis ?? []) {
    const t = metaDe(k.id), r = resDe(k.id)
    const v = estadoDe({ meta: t?.value ?? null, operador: t?.operator ?? null, valor: r?.value ?? null })
    const planes = [enPE.has(k.id) && 'PE', enEF.has(k.id) && 'EF', enEV.has(k.id) && 'EV'].filter(Boolean) as string[]
    const c = cat.get(String(k.code).trim().toUpperCase())
    const dim = c?.dimname ?? DIMENSIONES[String(k.code).split('-')[0]] ?? '—'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rp: any = enPE.get(k.id) ?? enEF.get(k.id)
    filas.push({
      code: String(k.code).trim(), name: k.name, dimension: dim, unidad: k.unit ?? null,
      formula: k.formula || c?.formula || '',
      planes, meta: t?.value ?? null, operador: t?.operator ?? '>=', resultado: r?.value ?? null,
      estado: v.estado, motivo: v.motivo, sospecha: v.sospecha,
      responsable: rp?.owner_label ?? (rp?.responsible_id ? nombreEmp.get(rp.responsible_id) : null) ?? rp?.responsible_unit ?? null,
      decision: (enEF.get(k.id) as { decision?: string } | undefined)?.decision ?? null,
    })
  }

  // Las medidas del Plan de Evaluación que no se fundieron con ningún KPI son
  // indicadores por derecho propio: encuestas y rúbricas que solo ese plan usa.
  for (const m of iap ?? []) {
    if (m.indicator_id) continue
    const v = m.result_status === 'no_aplicable'
      ? { estado: 'no_aplicable' as Estado, motivo: 'el indicador no puede medirse todavía en este periodo', sospecha: null }
      : estadoDe({ meta: m.target_value ?? null, operador: m.target_operator ?? null, valor: m.result_value ?? null })
    const c = cat.get(String(m.code).trim().toUpperCase())
    filas.push({
      code: String(m.code).trim(), name: m.name,
      dimension: c?.dimname ?? DIMENSIONES[String(m.code).split('-')[0]] ?? 'Assessment',
      unidad: null, formula: c?.formula ?? '',
      planes: ['EV'], meta: m.target_value ?? null, operador: m.target_operator ?? '>=',
      meta_texto: m.target_text ?? null, resultado: m.result_value ?? null,
      estado: v.estado, motivo: v.motivo, sospecha: v.sospecha,
      responsable: m.owner_label ?? m.responsible_unit ?? null, decision: m.decision ?? null,
    })
  }

  filas.sort((a, b) => SEVERIDAD[a.estado as Estado] - SEVERIDAD[b.estado as Estado] || a.code.localeCompare(b.code))

  const contar = (plan?: string) => {
    const base = plan ? filas.filter(f => f.planes.includes(plan)) : filas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = { total: base.length, cumplido: 0, parcial: 0, no_cumplido: 0, sin_datos: 0, no_aplicable: 0 }
    for (const f of base) c[f.estado]++
    return c
  }

  // Oportunidades de mejora: lo que puede cambiar de estado sin cambiar la
  // gestión, solo consiguiendo el dato. Es una lista de trabajo, no un
  // reproche: por eso separa "falta medirlo" de "está cerca".
  const oportunidades = filas
    .filter(f => f.estado === 'sin_datos' || f.sospecha ||
      (f.estado === 'parcial' && f.meta && Math.abs(Number(f.resultado)) / Math.abs(Number(f.meta)) >= 0.9))
    .map(f => ({
      ...f,
      razon: f.estado === 'sin_datos' ? 'falta el dato: con la evidencia adecuada puede cambiar de estado'
        : f.sospecha ? `el dato no es comparable con la meta — ${f.sospecha}`
        : 'está a menos del 10% de la meta',
    }))

  return NextResponse.json({
    anio: { id: anio.id, name: anio.name },
    anios: (anios ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
    resumen: { todos: contar(), PE: contar('PE'), EF: contar('EF'), EV: contar('EV') },
    dimensiones: [...new Set(filas.map(f => f.dimension))].sort(),
    oportunidades,
    filas,
  })
}
