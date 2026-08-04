import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// AUDITOR DE PLANEAMIENTO
//
// Los tres planes comparten objetivos, indicadores y resultados, y cada uno
// los declara a su manera. Donde dos declaraciones del mismo hecho no
// coinciden, hay una inconsistencia — y encontrarlas a mano, entre tres
// documentos y un ERP, no lo hace nadie.
//
// El auditor no corrige: reporta. Una inconsistencia casi siempre es una
// decisión pendiente de alguien, no un bug — y arreglarla en silencio sería
// tomar esa decisión por ellos.
// ---------------------------------------------------------------------------

type Sev = 'alta' | 'media' | 'baja'
interface Hallazgo {
  id: string; sev: Sev; grupo: string; titulo: string
  detalle: string; afectados: string[]; sugerencia: string
}

export async function GET() {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado
  const sb = db()

  const [
    { data: objs }, { data: kpis }, { data: enlaces }, { data: medidas },
    { data: cal }, { data: alin }, { data: evid }, { data: resp }, { data: anios },
    { data: dims }, { data: acts }, { data: strats },
  ] = await Promise.all([
    sb.from('strategic_objectives').select('id, code, name, status, dimension_id'),
    sb.from('effectiveness_kpis').select('id, code, name, level, source, formula_type'),
    sb.from('effectiveness_plan_kpis').select('id, kpi_id, link_type, link_id, meta, meta_operator, resultado, responsible_id'),
    sb.from('iap_measures').select('id, code, name, source_binding, indicator_id, result_value, result_status, target_value, target_operator, owner_employee_id, effectiveness_kpi_codes, strategic_kpi_codes'),
    sb.from('iap_calendar').select('seq, period_label, measure_codes'),
    sb.from('iap_measure_objectives').select('measure_id, objective_id'),
    sb.from('iap_measure_evidence').select('measure_id, url'),
    sb.from('strategic_action_responsibles').select('id, action_id'),
    sb.from('academic_years').select('id, name, start_date, end_date'),
    sb.from('strategic_dimensions').select('id, code, status, cycle_id'),
    sb.from('strategic_actions').select('id, code, strategy_id, status'),
    sb.from('strategic_strategies').select('id, objective_id, status'),
  ])

  const h: Hallazgo[] = []
  const add = (x: Hallazgo) => { if (x.afectados.length) h.push(x) }

  const kpiPorId = new Map((kpis ?? []).map((k: { id: string }) => [k.id, k]))
  const codigoKpi = new Set((kpis ?? []).map((k: { code: string }) => String(k.code ?? '').trim()))
  const medPorCodigo = new Set((medidas ?? []).map((m: { code: string }) => m.code))
  const objPorId = new Map((objs ?? []).map((o: { id: string }) => [o.id, o]))

  // ── 1. Declarado automático pero sin fórmula que lo calcule ──────────────
  add({
    id: 'binding-sin-formula', sev: 'alta', grupo: 'Origen del dato',
    titulo: 'Medidas declaradas como automáticas que el ERP no puede calcular',
    detalle: 'El IAP dice que salen del ERP, pero su indicador no tiene fórmula implementada. Hoy el número lo escribe una persona aunque el plan diga lo contrario.',
    sugerencia: 'Implementar la fórmula, o cambiar el origen del año a "externo" para que el plan diga la verdad.',
    afectados: (medidas ?? [])
      .filter((m: { source_binding: string; indicator_id: string | null }) => {
        if (m.source_binding !== 'erp_formula') return false
        const k = m.indicator_id ? kpiPorId.get(m.indicator_id) : null
        return !k || !(k as { formula_type: string | null }).formula_type
      })
      .map((m: { code: string; name: string }) => `${m.code} · ${m.name}`),
  })

  // ── 2. Cero sin evidencia: casi siempre es "sin datos" ───────────────────
  const conEvidencia = new Set((evid ?? []).map((e: { measure_id: string }) => e.measure_id))
  add({
    id: 'cero-sin-evidencia', sev: 'alta', grupo: 'Calidad del resultado',
    titulo: 'Resultado en cero registrado como incumplimiento',
    detalle: 'Un cero afirma que se midió y dio cero. Si además no hay evidencia, lo más probable es que no se haya podido medir — y la escala del propio documento pide no registrar cero en ese caso.',
    sugerencia: 'Revisar si corresponde el estado "Sin datos". Ante un acreditador, un vacío de evidencia y un incumplimiento son cosas opuestas.',
    afectados: (medidas ?? [])
      .filter((m: { result_value: number | null; result_status: string | null; id: string }) =>
        Number(m.result_value) === 0 && m.result_status === 'no_cumplido' && !conEvidencia.has(m.id))
      .map((m: { code: string; name: string }) => `${m.code} · ${m.name}`),
  })

  // ── 3. El estado cargado no coincide con la meta ─────────────────────────
  add({
    id: 'estado-vs-meta', sev: 'media', grupo: 'Calidad del resultado',
    titulo: 'Estado que contradice el cálculo contra la meta',
    detalle: 'El resultado alcanza la meta pero está marcado como no cumplido, o al revés.',
    sugerencia: 'Corregir el estado, o documentar por qué el criterio difiere del cálculo.',
    afectados: (medidas ?? [])
      .filter((m: { result_value: number | null; target_value: number | null; target_operator: string; result_status: string | null }) => {
        if (m.result_value === null || m.target_value === null || !m.result_status) return false
        const ok = m.target_operator === '<=' ? Number(m.result_value) <= Number(m.target_value) : Number(m.result_value) >= Number(m.target_value)
        return (ok && m.result_status === 'no_cumplido') || (!ok && m.result_status === 'cumplido')
      })
      .map((m: { code: string; result_value: number | null; target_operator: string; target_value: number | null; result_status: string | null }) =>
        `${m.code} · resultado ${m.result_value} vs meta ${m.target_operator} ${m.target_value} — marcado "${m.result_status}"`),
  })

  // ── 4. Objetivos que nadie mide ──────────────────────────────────────────
  const objConMedida = new Set((alin ?? []).map((a: { objective_id: string }) => a.objective_id))
  const objConKpi = new Set((enlaces ?? []).filter((e: { link_type: string }) => e.link_type === 'objetivo')
    .map((e: { link_id: string }) => e.link_id))
  add({
    id: 'objetivo-sin-medicion', sev: 'alta', grupo: 'Cobertura',
    titulo: 'Objetivos del plan estratégico que ningún plan mide',
    detalle: 'El plan los declara y ni el IAP ni el Plan de Efectividad les asignan indicadores. Se avanza sin poder demostrarlo.',
    sugerencia: 'Asignarles indicadores, o retirarlos del plan si son estructura interna que no se reporta.',
    afectados: (objs ?? [])
      .filter((o: { status: string; id: string }) => o.status === 'active' && !objConMedida.has(o.id) && !objConKpi.has(o.id))
      .map((o: { code: string; name: string }) => `${o.code} · ${o.name}`),
  })

  // ── 5. El calendario apunta a medidas inexistentes ───────────────────────
  const rotos: string[] = []
  for (const c of cal ?? []) {
    const malos: string[] = []
    for (const raw of (c.measure_codes ?? []) as string[]) {
      const t = raw.trim(); if (!t || t.toLowerCase() === 'todas') continue
      const r = t.match(/^([A-Z]-\d{2})\.\.([A-Z]-\d{2})$/)
      if (r) { for (const p of [r[1], r[2]]) if (!medPorCodigo.has(p)) malos.push(p) }
      else if (!medPorCodigo.has(t)) malos.push(t)
    }
    if (malos.length) rotos.push(`Fila ${c.seq} (${c.period_label}) → ${[...new Set(malos)].join(', ')}`)
  }
  add({
    id: 'calendario-roto', sev: 'media', grupo: 'Consistencia documental',
    titulo: 'Actividades del calendario que apuntan a medidas no definidas',
    detalle: 'El Apéndice A referencia códigos que la Tabla 4 del mismo documento no define.',
    sugerencia: 'Reconciliar el documento: agregar las medidas faltantes o corregir los códigos del calendario.',
    afectados: rotos,
  })

  // ── 6. Códigos de KPI citados que no existen en el catálogo ──────────────
  const citados = new Map<string, string[]>()
  for (const m of medidas ?? []) {
    for (const c of [...(m.effectiveness_kpi_codes ?? []), ...(m.strategic_kpi_codes ?? [])] as string[]) {
      const t = c.trim(); if (!t || codigoKpi.has(t)) continue
      if (!citados.has(t)) citados.set(t, [])
      citados.get(t)!.push(m.code)
    }
  }
  add({
    id: 'kpi-inexistente', sev: 'media', grupo: 'Consistencia documental',
    titulo: 'KPIs citados por el IAP que no existen en el catálogo',
    detalle: 'El IAP cruza cada medida con KPIs de los otros dos planes, pero algunos códigos no corresponden a ningún indicador cargado.',
    sugerencia: 'Cargar esos KPIs al catálogo, o corregir la referencia en el documento.',
    afectados: [...citados.entries()].map(([c, ms]) => `${c} — citado por ${ms.join(', ')}`),
  })

  // ── 7. Enlaces de Efectividad que apuntan a la nada ──────────────────────
  const objIds = new Set((objs ?? []).map((o: { id: string }) => o.id))
  const actIds = new Set((acts ?? []).map((a: { id: string }) => a.id))
  const respIds = new Set((resp ?? []).map((r: { id: string }) => r.id))
  add({
    id: 'enlace-colgando', sev: 'alta', grupo: 'Integridad',
    titulo: 'KPIs enganchados a un elemento que ya no existe',
    detalle: 'link_id no tiene llave foránea porque es polimórfico, así que un objetivo o acción borrado deja el KPI apuntando al vacío. El indicador desaparece de los tableros sin dar error.',
    sugerencia: 'Reasignar esos KPIs a un elemento vigente del plan.',
    afectados: (enlaces ?? [])
      .filter((e: { link_id: string; link_type: string }) => {
        const s = e.link_type === 'objetivo' ? objIds : e.link_type === 'accion_estrategica' ? actIds : respIds
        return e.link_id && !s.has(e.link_id)
      })
      .map((e: { kpi_id: string; link_type: string }) => {
        const k = kpiPorId.get(e.kpi_id) as { code?: string; name?: string } | undefined
        return `${String(k?.code ?? '?').trim()} · ${k?.name ?? ''} (${e.link_type})`
      }),
  })

  // ── 8. El nivel del KPI no coincide con dónde cuelga ─────────────────────
  const esperado: Record<string, string> = {
    institucional: 'objetivo', estrategico: 'accion_estrategica', operativo: 'accion_responsable',
  }
  add({
    id: 'nivel-desalineado', sev: 'media', grupo: 'Estructura',
    titulo: 'KPIs enganchados a un nivel distinto del que declaran',
    detalle: 'El catálogo clasifica cada KPI como institucional, estratégico u operativo, y esos tres niveles corresponden a objetivo, acción y responsable. Un KPI operativo colgado del objetivo no se puede rastrear hasta la acción ni hasta la persona que lo mueve.',
    sugerencia: 'Reenganchar cada KPI al nivel que le corresponde, o corregir su nivel en el catálogo.',
    afectados: (enlaces ?? [])
      .filter((e: { kpi_id: string; link_type: string }) => {
        const k = kpiPorId.get(e.kpi_id) as { level?: string } | undefined
        const esp = k?.level ? esperado[k.level] : null
        return !!esp && esp !== e.link_type
      })
      .map((e: { kpi_id: string; link_type: string }) => {
        const k = kpiPorId.get(e.kpi_id) as { code?: string; level?: string } | undefined
        return `${String(k?.code ?? '?').trim()} (${k?.level}) está en "${e.link_type}", debería estar en "${esperado[k?.level ?? '']}"`
      }),
  })

  // ── 9. Resultado sin evidencia que lo respalde ───────────────────────────
  add({
    id: 'resultado-sin-evidencia', sev: 'media', grupo: 'Calidad del resultado',
    titulo: 'Medidas con resultado pero sin ningún documento de respaldo',
    detalle: 'Un resultado sin evidencia es una afirmación sin sustento.',
    sugerencia: 'Adjuntar el documento que produjo el número.',
    afectados: (medidas ?? [])
      .filter((m: { result_status: string | null; id: string }) => m.result_status && !conEvidencia.has(m.id))
      .map((m: { code: string; name: string }) => `${m.code} · ${m.name}`),
  })

  // ── 10. Evidencia citada pero sin documento adjunto ──────────────────────
  const sinDoc = (evid ?? []).filter((e: { url: string | null }) => !e.url).length
  if (sinDoc) h.push({
    id: 'evidencia-sin-archivo', sev: 'media', grupo: 'Calidad del resultado',
    titulo: 'Evidencia citada por nombre, sin archivo adjunto',
    detalle: `${sinDoc} referencia(s) son un nombre escrito a mano. Nadie puede abrirlas ni verificar que existan.`,
    sugerencia: 'Adjuntar los archivos. Una referencia que no se puede abrir vale lo mismo que ninguna.',
    afectados: [`${sinDoc} documento(s) pendientes de adjuntar`],
  })

  // ── 11. Acciones sin años habilitados: nadie puede reportar avance ───────
  const conAnios = new Set<string>()
  const { data: anosResp } = await sb.from('strategic_responsible_years').select('responsible_id')
  for (const a of anosResp ?? []) conAnios.add(a.responsible_id)
  const sinAnios = (resp ?? []).filter((r: { id: string }) => !conAnios.has(r.id)).length
  if (sinAnios) h.push({
    id: 'sin-anios', sev: 'alta', grupo: 'Operación',
    titulo: 'Acciones por responsable sin años habilitados',
    detalle: `${sinAnios} de ${(resp ?? []).length} responsables no pueden registrar avance: la pantalla se los impide hasta que se les definan los años.`,
    sugerencia: 'Habilitar los años del ciclo en Cargar Plan. Sin esto, el dashboard del plan estratégico se queda vacío para siempre.',
    afectados: [`${sinAnios} responsables bloqueados`],
  })

  // ── 12. Responsables sin persona vinculada ───────────────────────────────
  add({
    id: 'responsable-sin-vincular', sev: 'baja', grupo: 'Operación',
    titulo: 'Medidas del IAP sin responsable vinculado a una persona',
    detalle: 'Sin persona asignada no hay a quién reclamarle el dato.',
    sugerencia: 'Vincular el responsable a un empleado del ERP.',
    afectados: (medidas ?? [])
      .filter((m: { owner_employee_id: string | null }) => !m.owner_employee_id)
      .map((m: { code: string; name: string }) => `${m.code} · ${m.name}`),
  })

  const orden: Record<Sev, number> = { alta: 0, media: 1, baja: 2 }
  h.sort((a, b) => orden[a.sev] - orden[b.sev] || a.grupo.localeCompare(b.grupo))

  return NextResponse.json({
    generado: new Date().toISOString(),
    resumen: {
      hallazgos: h.length,
      alta: h.filter(x => x.sev === 'alta').length,
      media: h.filter(x => x.sev === 'media').length,
      baja: h.filter(x => x.sev === 'baja').length,
      elementos: h.reduce((t, x) => t + x.afectados.length, 0),
    },
    contexto: {
      objetivos: (objs ?? []).filter((o: { status: string }) => o.status === 'active').length,
      dimensiones: (dims ?? []).filter((d: { status: string }) => d.status === 'active').length,
      estrategias: (strats ?? []).filter((s: { status: string }) => s.status === 'active').length,
      kpis: (kpis ?? []).length,
      medidas: (medidas ?? []).length,
      anios: (anios ?? []).length,
    },
    hallazgos: h,
  })
}
