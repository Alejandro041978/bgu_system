// La nota mínima aprobatoria es una REGLA de la institución, no un dato de la
// nota.
//
// Vino de SystemActiva pegada a cada fila —8.953 notas de Bachelor con 75,
// mientras el ERP declara 70— y mandaba sobre la configuración, porque los
// lectores hacían `nota.passing_score ?? categoría`. El resultado: dos varas
// distintas dentro de la misma acta según de dónde hubiera llegado cada nota,
// y 62 estudiantes desaprobados con 70-74 que la institución aprueba.
//
// La importación de Moodle ya lo hacía bien: lee el mínimo de la categoría del
// programa. Esto extiende ese criterio a todos los lectores.
//
// Vive aquí porque lo necesitan cuatro sitios —acta, exámenes, recálculo de
// estado y escritura de notas— y cada uno lo resolvía por su cuenta, dos de
// ellos con un 70 fijo que dejaba a Master y Doctorado midiéndose con la vara
// de Bachelor.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/** course_id → nota mínima de la categoría de su programa. */
export async function passingByCourse(sb: SB): Promise<Map<string, number>> {
  const [{ data: cats }, { data: progs }, { data: courses }] = await Promise.all([
    sb.from('academic_programs_category').select('id, passing_score'),
    sb.from('academic_programs').select('id, category_id'),
    sb.from('academic_courses').select('id, program_id'),
  ])
  const porCat = new Map<string, number>()
  for (const c of (cats ?? []) as { id: string; passing_score: number | null }[]) {
    if (c.passing_score != null) porCat.set(c.id, Number(c.passing_score))
  }
  const catDe = new Map<string, string | null>(
    ((progs ?? []) as { id: string; category_id: string | null }[]).map(p => [p.id, p.category_id]))

  const out = new Map<string, number>()
  for (const c of (courses ?? []) as { id: string; program_id: string | null }[]) {
    const cat = c.program_id ? catDe.get(c.program_id) : null
    const p = cat ? porCat.get(cat) : undefined
    if (p != null) out.set(c.id, p)
  }
  return out
}

/**
 * Mínimo aplicable a una nota. El de la categoría manda; el que traiga la fila
 * queda como último recurso para lo que no se pueda resolver (una nota sin
 * asignatura de la malla, por ejemplo).
 */
export function passingFor(
  fila: { course_id?: string | null; passing_score?: number | null },
  porCurso: Map<string, number>,
): number | null {
  const porCat = fila.course_id ? porCurso.get(fila.course_id) : undefined
  if (porCat != null) return porCat
  return fila.passing_score != null ? Number(fila.passing_score) : null
}
