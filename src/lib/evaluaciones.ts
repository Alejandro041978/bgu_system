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

// extra = bono (Live Class Quiz, extra credit en Moodle): no pesa en el 100%,
// val son PUNTOS logrados (0–max). Queda fuera de suma() vía pct null.
export interface Slot { n?: number; desc: string; pct: number | null; val: number | null; extra?: boolean; max?: number | null }

// El contenedor del bloque de proceso viene con tres nombres distintos según de
// dónde llegó el acta. "Notes" a secas es el mismo animal que "Process Notes":
// aparecía en 22 actas de General Psychology y las hacía sumar 200%.
// Las dos primeras van SIN anclar porque el contenedor suele traer coletilla
// —"Notas de proceso (12 test)"—; las dos últimas van ancladas porque "Notes" a
// secas es contenedor, pero "Final Notes" o "Notes on the Project" no lo serían.
const AGREGADO = /process\s*notes|notas?\s*de\s*proceso|^\s*notes?\s*$|^\s*notas?\s*$/i
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

  // CASO A — el "Total" sintético al 100%: la nota final colada entre las
  // evaluaciones. Se quita solo si de verdad vale 100 y hay evaluaciones
  // debajo; si vale menos, NO es el total del curso sino el contenedor del
  // bloque de proceso, y le toca el caso B.
  //
  // Distinguirlos por el peso y no por el nombre salió de auditar las actas:
  // ocho asignaturas aparecían sin sumar 100 y en cinco el "Total" valía 50 —
  // era la caja que contenía a los Assessments—. Quitarlo entero dejaba el
  // bloque de proceso pesando el doble de lo que le tocaba.
  const esContenedor = (s: Slot) =>
    TOTAL.test(String(s.desc ?? '')) || AGREGADO.test(String(s.desc ?? ''))
  const totalPleno = grades.find(s => TOTAL.test(String(s.desc ?? '')) && Math.abs(Number(s.pct ?? 0) - 100) < 0.6)
  if (process.length && totalPleno) {
    grades = grades.filter(s => s !== totalPleno)
    quitóTotal = true
  }

  // CASO B — el contenedor del bloque de proceso: "Process Notes", "Notes", o
  // un "Total" que no llega a 100. El bloque desaparece y sus evaluaciones
  // pasan a pesar lo que de verdad pesan sobre la asignatura.
  const agg = grades.find(s => esContenedor(s))
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
    // el aula. Sin evaluaciones no se juzga: no hay nada que sumar. Y si
    // NINGUNA declara peso tampoco: es un detalle descriptivo (p. ej. el
    // reconstruido de las aulas de suma directa de 2023-25, donde el "peso"
    // no existía como configuración) — no un aula mal ponderada.
    descuadrado: (grades.length + process.length) > 0
      && [...grades, ...process].some(s => s.pct != null)
      && Math.abs(total - 100) > 0.6,
  }
}
