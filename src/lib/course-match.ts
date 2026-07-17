// ---------------------------------------------------------------------------
// Emparejamiento de una nota con una asignatura de la malla.
//
// El nombre es la ÚNICA llave viable: los códigos de academic_grades vienen de
// SystemActiva y son números de orden dentro de la malla (102, 104, 205...), no
// códigos de asignatura. No guardan relación con los nuestros (ACC 230, PMB 270)
// y además colisionan: en Contabilidad el número 205 corresponde a tres
// asignaturas distintas. Emparejar por número asignaría notas al azar.
//
// courseNameKey ignora acentos y puntuación porque la carga histórica trae
// variantes del mismo nombre ("Financial Decision-Making" vs "Financial Decision
// Making", "Competitive Advantage Theory and Application|" con una barra
// suelta). Verificado sobre los 65 programas: ninguna asignatura distinta del
// mismo programa colapsa con otra al normalizar así.
//
// Esta regla la comparten graduates.ts, document-requirements.ts, acta y
// retention-context.ts. Deben coincidir siempre: si divergen, Camila le dice al
// estudiante que le faltan 3 asignaturas mientras el acta le muestra 5.
// ---------------------------------------------------------------------------

const base = (s: string | null | undefined): string =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---------------------------------------------------------------------------
// Alias: nombres con los que una asignatura quedó grabada en academic_grades
// durante la importación histórica de SystemActiva.
//
// Es una lista CERRADA, no una regla: ya no se importa de SystemActiva, así que
// el conjunto de nombres defectuosos no crece. Cada entrada está verificada
// contra la malla del programa; no se infiere por parecido.
//
// Deliberadamente NO se emparejan nombres por prefijo ni por contención: dentro
// de un mismo programa conviven 'Principles of Accounting I' y 'Principles of
// Accounting II', 'English Composition I' y 'II', 'Dissertation Proposal and
// Research I/II/III'. Un match por prefijo daría por aprobada la segunda a quien
// sólo cursó la primera. Se comprobó: ocho pares colisionan así.
//
// Casos evaluados y DESCARTADOS a propósito:
//   'Qualitative Research II' -> 'Qualitative Research': mismo riesgo I/II y sus
//      19 filas no traen calificación, así que no rescataría a nadie.
//   'Business Leadership & Entrepreneurship' -> 'Business Leadership': el
//      sufijo sugiere otra asignatura, no una variante de escritura.
//   'Energy Eciency Optimization': sin equivalente en ninguna malla.
// ---------------------------------------------------------------------------
const ALIASES = new Map<string, string>([
  ['quantitative and qualitative methods for decision', 'quantitative and qualitative methods for decision making'],
  ['business administration capstone project', 'business administration capstone'],
  ['development of artificial intelligence application', 'development of artificial intelligence applications'],
])

export const courseNameKey = (s: string | null | undefined): string => {
  const k = base(s)
  return ALIASES.get(k) ?? k
}

// ¿esta fila de nota corresponde a esta asignatura de la malla?
export function sameCourse(
  gradeName: string | null | undefined,
  courseName: string | null | undefined,
): boolean {
  const a = courseNameKey(gradeName)
  const b = courseNameKey(courseName)
  return a !== '' && a === b
}
