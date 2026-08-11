// ---------------------------------------------------------------------------
// Las evaluaciones de una asignatura suman 100%.
//
// Regla de la institución (usuario, 2026-08-11): nada se agrupa. Todas las
// notas entran directo al promedio de la asignatura, así que sus pesos suman
// 100 y no 200.
//
// El acta detallada guardaba dos bloques de 100% cada uno y los pintaba
// seguidos, así que la columna sumaba 200%. Medido sobre 21.195 filas: 17.361
// estaban así, por dos motivos distintos.
//
//   CASO A (14.020) · el importador de Moodle añadía un slot "Total" al 100%
//   junto a las evaluaciones reales. El Total no es una evaluación: es la nota
//   final, que ya vive en su propia columna y se muestra aparte.
//
//   CASO B (3.341) · el modelo viejo de SystemActiva, donde "Process Notes"
//   era UNA nota que agrupaba las de proceso. Sus 6,66% eran del bloque, no de
//   la asignatura: 15 × 6,66% × 50% = 50% real. Es el agrupamiento que la
//   institución dejó de usar.
//
// Se normaliza al LEER y no migrando la tabla, a propósito: el caso B lo
// escribe el sync de SystemActiva por N8N, fuera de este código. Una migración
// quedaría deshecha en la siguiente corrida, y entonces el error volvería sin
// que nadie lo note. Normalizando aquí, el acta sale bien venga como venga.
// ---------------------------------------------------------------------------

export interface Slot { n?: number; desc: string; pct: number | null; val: number | null }

const AGREGADO = /process\s*notes|notas?\s*de\s*proceso/i
const TOTAL = /^\s*total\s*$/i

export const suma = (s: Slot[] | null | undefined): number =>
  (s ?? []).reduce((t, x) => t + Number(x?.pct ?? 0), 0)

export interface Normalizado {
  grades: Slot[]
  process_grades: Slot[]
  total_pct: number
  // Qué se hizo, para poder explicarlo en pantalla en vez de que los números
  // cambien sin motivo aparente.
  ajuste: 'ninguno' | 'total_retirado' | 'proceso_aplanado' | 'ambos'
  // true cuando después de normalizar sigue sin sumar 100: es un aula mal
  // ponderada, y eso hay que verlo, no taparlo.
  descuadrado: boolean
}

export function normalizarEvaluaciones(
  gradesIn: Slot[] | null | undefined,
  processIn: Slot[] | null | undefined,
): Normalizado {
  let grades = [...(gradesIn ?? [])]
  let process = [...(processIn ?? [])]
  let quitóTotal = false
  let aplanó = false

  // CASO A — el "Total" sintético. Solo estorba cuando hay evaluaciones de
  // verdad debajo: si fuera lo único que hay, es el único dato disponible.
  if (process.length && grades.some(s => TOTAL.test(String(s.desc ?? '')))) {
    grades = grades.filter(s => !TOTAL.test(String(s.desc ?? '')))
    quitóTotal = true
  }

  // CASO B — el agregado "Process Notes" y su detalle. El bloque desaparece y
  // sus evaluaciones pasan a pesar lo que de verdad pesan sobre la asignatura.
  const agg = grades.find(s => AGREGADO.test(String(s.desc ?? '')))
  if (agg && process.length && Number(agg.pct) > 0) {
    const factor = Number(agg.pct) / 100
    grades = grades.filter(s => s !== agg)
    process = process.map(s => ({
      ...s,
      pct: s.pct == null ? null : Math.round(Number(s.pct) * factor * 100) / 100,
    }))
    aplanó = true
  }

  const total = Math.round((suma(grades) + suma(process)) * 100) / 100
  return {
    grades, process_grades: process, total_pct: total,
    ajuste: quitóTotal && aplanó ? 'ambos' : quitóTotal ? 'total_retirado' : aplanó ? 'proceso_aplanado' : 'ninguno',
    // Con evaluaciones y un total que no llega a 100 hay algo mal ponderado en
    // el aula. Sin evaluaciones no se juzga: no hay nada que sumar.
    descuadrado: (grades.length + process.length) > 0 && Math.abs(total - 100) > 0.6,
  }
}
