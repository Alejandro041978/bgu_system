// ---------------------------------------------------------------------------
// Consolidación del catálogo de indicadores.
//
// Los tres planes se cargaron por separado desde tres Excel, así que el mismo
// indicador entró hasta tres veces con códigos distintos: "Retención de
// faculty" en el Estratégico y "Permanencia docente" en el de Efectividad son
// el mismo número medido con la misma fórmula. 82 renglones para 57
// indicadores reales.
//
// El mapa de fusiones no lo decidió el sistema: salió de la revisión de
// Planeamiento (supabase/kpis_fusiones.json), que respondió caso por caso cuál
// sobrevive. Aquí solo se aplica.
//
// Dos formas de fundir, según de qué tabla venga el miembro:
//   · Un KPI del catálogo (effectiveness_kpis) se ABSORBE: sus enlaces de
//     plan, metas y resultados pasan al superviviente y la fila se retira.
//   · Una medida del plan de Evaluación (iap_measures) NO se borra: la medida
//     es el instrumento —una encuesta, una rúbrica— y sigue existiendo. Lo que
//     cambia es que pasa a apuntar al indicador superviviente.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface Grupo { destino: string; absorbe: string[]; nota?: string }
export interface MapaFusiones {
  grupos: Grupo[]
  nuevo: { destino: string; absorbe: string[]; name: string; planes: string[]; nota?: string }
}

export interface Movimiento {
  destino: string
  destino_nombre: string
  absorbe: { code: string; tipo: 'kpi' | 'medida'; nombre: string; planes: string[]; metas: number; resultados: number }[]
  enlaces_a_mover: string[]
  metas_a_mover: number
  resultados_a_mover: number
  choques: string[]
}

export interface Simulacro {
  grupos: Movimiento[]
  sin_resolver: string[]
  totales: { grupos: number; absorbidos: number; enlaces: number; metas: number; resultados: number; choques: number }
}

/**
 * Qué pasaría al fusionar. No escribe nada.
 *
 * El choque que importa es el de resultados: si el mismo año tiene un valor en
 * los dos indicadores y no coinciden, fusionar significaría elegir uno y
 * perder el otro. Eso no se decide solo.
 */
export async function simularFusiones(sb: SB, mapa: MapaFusiones): Promise<Simulacro> {
  const [{ data: kpis }, { data: medidas }, { data: pe }, { data: ef }, { data: targets }, { data: results }] =
    await Promise.all([
      sb.from('effectiveness_kpis').select('id, code, name'),
      sb.from('iap_measures').select('id, code, name, indicator_id'),
      sb.from('strategic_plan_kpis').select('id, kpi_id'),
      sb.from('effectiveness_plan_kpis').select('id, kpi_id'),
      sb.from('indicator_targets').select('id, indicator_id, academic_year_id, value, operator'),
      sb.from('indicator_results').select('id, indicator_id, academic_year_id, period, value'),
    ])

  const porCodigo = new Map<string, { id: string; name: string; tipo: 'kpi' | 'medida' }>()
  for (const k of kpis ?? []) porCodigo.set(String(k.code).toUpperCase(), { id: k.id, name: k.name, tipo: 'kpi' })
  for (const m of medidas ?? []) porCodigo.set(String(m.code).toUpperCase(), { id: m.id, name: m.name, tipo: 'medida' })

  const enPE = new Set((pe ?? []).map((x: { kpi_id: string }) => x.kpi_id))
  const enEF = new Set((ef ?? []).map((x: { kpi_id: string }) => x.kpi_id))
  const planesDe = (id: string, tipo: string) =>
    tipo === 'medida' ? ['EV'] : [enPE.has(id) && 'PE', enEF.has(id) && 'EF'].filter(Boolean) as string[]

  const metasDe = (id: string) => (targets ?? []).filter((t: { indicator_id: string }) => t.indicator_id === id)
  const resDe = (id: string) => (results ?? []).filter((r: { indicator_id: string }) => r.indicator_id === id)

  const sinResolver: string[] = []
  const grupos: Movimiento[] = []

  for (const g of mapa.grupos) {
    const dest = porCodigo.get(g.destino.toUpperCase())
    if (!dest) { sinResolver.push(`no existe el destino ${g.destino}`); continue }
    if (dest.tipo !== 'kpi') { sinResolver.push(`el destino ${g.destino} es una medida, no un indicador del catálogo`); continue }

    const mov: Movimiento = {
      destino: g.destino, destino_nombre: dest.name, absorbe: [],
      enlaces_a_mover: [], metas_a_mover: 0, resultados_a_mover: 0, choques: [],
    }
    const resDestino = resDe(dest.id)
    const metasDestino = metasDe(dest.id)

    for (const code of g.absorbe) {
      const m = porCodigo.get(code.toUpperCase())
      if (!m) { sinResolver.push(`no existe ${code} (grupo ${g.destino})`); continue }
      const planes = planesDe(m.id, m.tipo)
      const metas = m.tipo === 'kpi' ? metasDe(m.id) : []
      const res = m.tipo === 'kpi' ? resDe(m.id) : []
      mov.absorbe.push({ code, tipo: m.tipo, nombre: m.name, planes, metas: metas.length, resultados: res.length })

      // Un plan que el superviviente todavía no tiene lo gana con la fusión.
      for (const p of planes) if (!planesDe(dest.id, 'kpi').includes(p) && !mov.enlaces_a_mover.includes(p)) mov.enlaces_a_mover.push(p)
      mov.metas_a_mover += metas.length
      mov.resultados_a_mover += res.length

      // Choques: mismo año con valor en los dos y distinto.
      for (const r of res) {
        const igual = resDestino.find((x: { academic_year_id: string; period: string }) =>
          x.academic_year_id === r.academic_year_id && x.period === r.period)
        if (igual && Number(igual.value) !== Number(r.value)) {
          mov.choques.push(`resultado ${r.period}: ${g.destino}=${igual.value} vs ${code}=${r.value}`)
        }
      }
      for (const t of metas) {
        const igual = metasDestino.find((x: { academic_year_id: string }) => x.academic_year_id === t.academic_year_id)
        if (igual && Number(igual.value) !== Number(t.value)) {
          mov.choques.push(`meta: ${g.destino}=${igual.value} vs ${code}=${t.value}`)
        }
      }
    }
    grupos.push(mov)
  }

  return {
    grupos, sin_resolver: sinResolver,
    totales: {
      grupos: grupos.length,
      absorbidos: grupos.reduce((s, g) => s + g.absorbe.length, 0),
      enlaces: grupos.reduce((s, g) => s + g.enlaces_a_mover.length, 0),
      metas: grupos.reduce((s, g) => s + g.metas_a_mover, 0),
      resultados: grupos.reduce((s, g) => s + g.resultados_a_mover, 0),
      choques: grupos.reduce((s, g) => s + g.choques.length, 0),
    },
  }
}
