// ---------------------------------------------------------------------------
// El código que se le muestra a una persona.
//
// academic_grades.course_code guarda el código con el que la nota llegó de
// SystemActiva, y ése NO es el código de la asignatura: es su número de orden
// dentro de la malla (101, 203, 207...). En el Acta Detallada de una alumna del
// BSBA se veía "207 · Advanced Statistics" cuando la asignatura es STA 460.
//
// Además esos números colisionan: "101" es el código de 54 asignaturas
// distintas en 65 programas. Nunca sirvieron como identificador y tampoco
// sirven como etiqueta.
//
// Ahora que cada nota guarda su course_id, el código correcto se lee del plan
// de estudios. El texto viejo queda como respaldo para el 1% de notas que
// todavía no resuelven a una asignatura.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function codigosDeMalla(sb: any, courseIds: (string | null | undefined)[]) {
  const ids = [...new Set(courseIds.filter(Boolean).map(String))]
  const out = new Map<string, { code: string | null; name: string | null }>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_courses')
      .select('id, code, name').in('id', ids.slice(i, i + 300))
    for (const c of (data ?? []) as { id: string; code: string | null; name: string | null }[]) {
      out.set(c.id, { code: c.code, name: c.name })
    }
  }
  return out
}

// El código de la malla si se conoce; si no, lo que trajo la importación.
export function codigoVisible(
  courseId: string | null | undefined,
  malla: Map<string, { code: string | null; name: string | null }>,
  respaldo: string | null | undefined,
): string | null {
  const c = courseId ? malla.get(String(courseId)) : undefined
  return c?.code ?? respaldo ?? null
}
