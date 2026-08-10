// ---------------------------------------------------------------------------
// El estado de un indicador se CALCULA.
//
// Hasta ahora lo decidía cada plan por su cuenta: Efectividad lo guardaba a
// mano en una columna, Evaluación en otra, y el Plan Estratégico no lo tenía —
// su estado solo existía en un Excel. Tres criterios para la misma pregunta.
//
// Las reglas no son inventadas: salen del catálogo institucional de estados
// (assessment_status_catalog) y se comprobaron contra los 53 estados que
// Planeamiento ya había decidido a mano. Coinciden en todos salvo dos, y esos
// dos resultaron ser errores de dato, no de criterio (ver más abajo).
// ---------------------------------------------------------------------------

export type Estado = 'cumplido' | 'parcial' | 'no_cumplido' | 'sin_datos' | 'no_aplicable'

export interface Medicion {
  meta: number | null
  operador: string | null      // '>=' (por defecto) o '<='
  valor: number | null
  /** El indicador no puede medirse legítimamente todavía (cohorte no madura). */
  no_aplica?: boolean
}

export interface Veredicto {
  estado: Estado
  /** Por qué, en una frase, para poder mostrarlo junto al número. */
  motivo: string
  /**
   * El dato huele mal aunque el estado se pueda calcular. No cambia el
   * veredicto: lo señala para que alguien lo mire.
   */
  sospecha: string | null
}

/**
 * Estado de una medición.
 *
 *   · cumple la meta                    → cumplido
 *   · hay avance pero no llega          → parcial
 *   · se midió y no hay avance (cero)   → no cumplido
 *   · falta la meta o el resultado      → sin datos
 *
 * El cero merece un párrafo. El catálogo institucional dice, con todas sus
 * letras, «la fuente no produjo información válida: NO registrar cero». En la
 * práctica el cero se usa para las dos cosas —«no avanzamos» y «no lo
 * medimos»— y no se pueden distinguir desde el dato. Aquí se toma como «no
 * cumplido», que es lo que Planeamiento decidió en los 11 casos que hoy están
 * así, y se marca la sospecha cuando la meta es de las que se cumplen bajando
 * (≤): un 0 contra «≤ 6 horas» daría cumplido por accidente.
 */
export function estadoDe(m: Medicion): Veredicto {
  if (m.no_aplica) {
    return { estado: 'no_aplicable', motivo: 'el indicador no puede medirse todavía en este periodo', sospecha: null }
  }
  const meta = m.meta != null && isFinite(Number(m.meta)) ? Number(m.meta) : null
  const valor = m.valor != null && isFinite(Number(m.valor)) ? Number(m.valor) : null
  if (meta == null) return { estado: 'sin_datos', motivo: 'no tiene meta fijada para el periodo', sospecha: null }
  if (valor == null) return { estado: 'sin_datos', motivo: 'no se ha registrado el resultado', sospecha: null }

  const menorEsMejor = String(m.operador ?? '>=').trim() === '<='
  const cumple = menorEsMejor ? valor <= meta : valor >= meta

  // Una meta y un resultado con órdenes de magnitud distintos no se pueden
  // comparar: casi siempre es que uno está en unidades y el otro en millones,
  // o una nota de 1-5 cargada por cien. Se avisa en vez de dar un veredicto
  // tranquilizador.
  const sospecha = (() => {
    if (valor === 0 && menorEsMejor) return 'el resultado es cero contra una meta que se cumple bajando: puede ser que no se haya medido'
    if (meta !== 0 && valor !== 0) {
      const r = Math.abs(valor) / Math.abs(meta)
      if (r >= 100 || r <= 0.01) return `meta ${meta} y resultado ${valor} difieren en varios órdenes de magnitud: revisar unidades`
    }
    return null
  })()

  if (cumple) return { estado: 'cumplido', motivo: `${valor} ${menorEsMejor ? '≤' : '≥'} ${meta}`, sospecha }
  if (valor > 0) return { estado: 'parcial', motivo: `hay avance (${valor}) pero no alcanza la meta (${meta})`, sospecha }
  return { estado: 'no_cumplido', motivo: `se midió y no hay avance (meta ${meta})`, sospecha }
}

export const ETIQUETA: Record<Estado, string> = {
  cumplido: 'Cumplido',
  parcial: 'Parcialmente cumplido',
  no_cumplido: 'No cumplido',
  sin_datos: 'Sin datos',
  no_aplicable: 'No aplicable / cohorte no madura',
}

/** Orden de peor a mejor, para ordenar tableros por lo que necesita atención. */
export const SEVERIDAD: Record<Estado, number> = {
  no_cumplido: 0, parcial: 1, sin_datos: 2, no_aplicable: 3, cumplido: 4,
}
