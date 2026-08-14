import { normalizarEvaluaciones } from '@/lib/evaluaciones'

// ---------------------------------------------------------------------------
// Auditor de Actas — actas cuyas ponderaciones no suman 100.
//
// El Auditor del Campus mira Moodle: que las ponderaciones de un aula sumen
// 100. Éste mira lo que llegó al expediente, que no es lo mismo — hay actas
// heredadas de SystemActiva que ningún aula respalda, y aulas reconfiguradas
// después de que sus notas ya estaban archivadas.
//
// UN SOLO CONTRASTE, y es una decisión tomada después de equivocarme.
//
// La primera versión traía tres. Dos comparaban cada asignatura consigo misma:
// "la misma evaluación pesa distinto entre actas" (89 hallazgos) y "el número
// de evaluaciones cambia entre actas" (24). Al abrir los casos uno por uno,
// TODOS cuadraban a 100: International Marketing tiene actas con 15
// Assessments al 6,66% —que son la asignatura entera— y otras con 15 al 3,33%
// más Module Tests y proyecto final. Son dos diseños del mismo curso en
// cohortes distintas, y los dos correctos.
//
// Medido después: 168 de 284 asignaturas tienen más de un diseño. Eso no es una
// anomalía, es la historia de un plan de estudios que evolucionó. Un reporte que
// llama error a lo normal enseña a no leerlo, y entonces tampoco se leen los 39
// casos que sí importan.
//
// Lo que queda es objetivo: el acta no suma 100, así que la nota final se
// calcula sobre una base que no es la del reglamento.
//
// Informa, no corrige. El veredicto sobre una nota es de Académica.
// ---------------------------------------------------------------------------

export interface HallazgoActa {
  asignatura: string
  programa: string
  /** Los totales distintos que aparecen en esa asignatura. */
  totales: string
  actas: number
  /** Quiénes son, para poder ir a mirar sin pedir otra consulta. */
  estudiantes: string
  detalle: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function auditarActas(sb: any): Promise<{
  revisadas: number; actas_mal: number; hallazgos: HallazgoActa[]
}> {
  const cursos = await todo(sb, 'academic_courses', 'id, name, program_id')
  const programas = await todo(sb, 'academic_programs', 'id, name')
  const nomPrograma = new Map(programas.map(p => [String(p.id), String(p.name)]))
  const infoCurso = new Map(cursos.map(c => [String(c.id), {
    nombre: String(c.name), programa: nomPrograma.get(String(c.program_id)) ?? '—',
  }]))

  const notas = await todo(sb, 'academic_grades', 'external_id, course_id, student_name')
  const cursoDe = new Map<string, string>()
  const alumnoDe = new Map<string, string>()
  for (const n of notas) {
    if (n.course_id) cursoDe.set(String(n.external_id), String(n.course_id))
    if (n.student_name) alumnoDe.set(String(n.external_id), String(n.student_name))
  }

  const detalles = await todo(sb, 'academic_grade_details', 'external_id, grades, process_grades')

  const porCurso = new Map<string, { alumnos: string[]; totales: Set<number> }>()
  let revisadas = 0
  let actasMal = 0

  for (const d of detalles) {
    const cid = cursoDe.get(String(d.external_id))
    if (!cid) continue                      // sin asignatura de la malla: no hay contra qué comparar
    const g = Array.isArray(d.grades) ? d.grades : []
    const p = Array.isArray(d.process_grades) ? d.process_grades : []
    const norm = normalizarEvaluaciones(g, p)
    if (!(norm.process_grades ?? []).length && !(norm.grades ?? []).length) continue
    revisadas++
    if (!norm.descuadrado) continue
    actasMal++
    if (!porCurso.has(cid)) porCurso.set(cid, { alumnos: [], totales: new Set() })
    const e = porCurso.get(cid)!
    e.alumnos.push(alumnoDe.get(String(d.external_id)) ?? '—')
    e.totales.add(Math.round(norm.total_pct * 100) / 100)
  }

  // Agrupado por asignatura y no por estudiante: una lista de veintidós nombres
  // no se arregla nombre por nombre, se arregla en el aula.
  const hallazgos: HallazgoActa[] = []
  for (const [cid, v] of porCurso) {
    const info = infoCurso.get(cid)
    if (!info) continue
    hallazgos.push({
      asignatura: info.nombre,
      programa: info.programa,
      totales: [...v.totales].sort((a, b) => a - b).map(t => `${t}%`).join(' · '),
      actas: v.alumnos.length,
      estudiantes: v.alumnos.slice(0, 4).join(', ') + (v.alumnos.length > 4 ? ` y ${v.alumnos.length - 4} más` : ''),
      detalle: [...v.totales].some(t => t < 100)
        ? 'Al acta le falta parte de su ponderación: o la importación perdió evaluaciones, o el aula nunca declaró el resto.'
        : 'El acta declara más del 100%: hay evaluaciones de más o mal ponderadas.',
    })
  }
  hallazgos.sort((a, b) => b.actas - a.actas)
  return { revisadas, actas_mal: actasMal, hallazgos }
}
