// ---------------------------------------------------------------------------
// Qué intento es cada fila de una asignatura.
//
// El acta detallada mostraba dos veces "General Psychology" sin decir cuál era
// cuál: una del 2024 con 0 y otra del 2025 con 97. Es un recursado —desaprobó
// y volvió a cursarla— y el acta personal ya se queda con la mejor, pero la
// detallada las enseñaba como si fueran dos cosas iguales.
//
// La columna `intento` existe, pero solo la llena el importador de Moodle: las
// filas heredadas de SystemActiva llegaron como inscripciones sueltas y todas
// dicen 1. Medido: 530 recursados reales en la base y 89 etiquetados.
//
// Así que el número se DERIVA al leer, por el periodo. No se migra la columna
// a propósito: el sync de SystemActiva sigue escribiendo filas nuevas, y una
// migración quedaría deshecha sin que nadie lo note — la misma razón por la
// que los pesos del acta se normalizan al leer.
//
// Dos filas del MISMO periodo NO son un recursado: son un duplicado, y llevan
// el mismo número. Llamar "Recursado 1" a un duplicado sería inventar un hecho
// académico que no ocurrió.
// ---------------------------------------------------------------------------

export interface FilaIntento {
  term_year?: number | null
  term_block?: string | null
  synced_at?: string | null
  intento?: number | null
}

// Clave de orden del periodo. Sin año no se puede ordenar: esas filas van al
// final y comparten número, que es lo honesto cuando no se sabe cuándo fue.
const clave = (f: FilaIntento): string =>
  f.term_year != null ? `${String(f.term_year).padStart(4, '0')}|${f.term_block ?? ''}` : ''

export function numerarIntentos<T extends FilaIntento>(filas: T[]): (T & { intento_calc: number })[] {
  const orden = [...filas].sort((a, b) => {
    const ka = clave(a), kb = clave(b)
    if (ka !== kb) return ka === '' ? 1 : kb === '' ? -1 : ka.localeCompare(kb)
    return String(a.synced_at ?? '').localeCompare(String(b.synced_at ?? ''))
  })
  const out: (T & { intento_calc: number })[] = []
  let n = 0
  let anterior: string | null = null
  for (const f of orden) {
    const k = clave(f)
    // Solo sube el contador al cambiar de periodo: las del mismo periodo son
    // el mismo intento visto dos veces.
    if (anterior === null || k !== anterior) n++
    anterior = k
    // Un intento ya numerado por el importador manda sobre el cálculo: esa
    // fila nació sabiendo que era un recursado.
    out.push({ ...f, intento_calc: Math.max(n, Number(f.intento ?? 1)) })
  }
  return out
}

// "Recursado 1" es el segundo intento; el primero no lleva etiqueta.
export function etiquetaDeIntento(n: number | null | undefined): string | null {
  const v = Number(n ?? 1)
  return v > 1 ? `Recursado ${v - 1}` : null
}
