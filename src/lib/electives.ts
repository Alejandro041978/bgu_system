// ---------------------------------------------------------------------------
// Electivas — fase 2: la elección y su lectura por los motores (08/09/2026).
//
// Una CASILLA electiva de la malla (is_elective) se cubre con una ELECCIÓN
// (student_electives): la asignatura elegida es del mismo programa, vive fuera
// de la malla exigible, y es la que se cursa y se califica. Para precio y
// egreso, la casilla "hereda" el destino de la elegida — y la casilla manda
// los créditos (decisión del usuario).
// ---------------------------------------------------------------------------
import { filaDeCurso } from './course-match'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface CursoElegido { id: string; code: string | null; name: string | null }

// Elecciones de UN estudiante: (program_id → (slot_course_id → curso elegido)).
// Los motores por-estudiante (computeActa, recomputeStudentByDocument,
// checkRequirements) la piden una vez y consultan por casilla.
export async function eleccionesDeEstudiante(sb: SB, studentId: string): Promise<Map<string, Map<string, CursoElegido>>> {
  const out = new Map<string, Map<string, CursoElegido>>()
  const { data: enrs } = await sb.from('academic_student_enrollments')
    .select('id, program_id').eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrRows = (enrs ?? []) as any[]
  if (!enrRows.length) return out
  const { data: els } = await sb.from('student_electives')
    .select('enrollment_id, slot_course_id, chosen:academic_courses!chosen_course_id(id, code, name)')
    .in('enrollment_id', enrRows.map(e => String(e.id)))
  const progDe = new Map(enrRows.map(e => [String(e.id), String(e.program_id)]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const el of (els ?? []) as any[]) {
    const pid = progDe.get(String(el.enrollment_id))
    if (!pid || !el.chosen) continue
    if (!out.has(pid)) out.set(pid, new Map())
    out.get(pid)!.set(String(el.slot_course_id), { id: String(el.chosen.id), code: el.chosen.code, name: el.chosen.name })
  }
  return out
}

// Elecciones de TODO el campus, para la pasada masiva de egresados:
// (`student_id|program_id` → (slot_course_id → curso elegido)).
export async function eleccionesMasivas(sb: SB): Promise<Map<string, Map<string, CursoElegido>>> {
  const out = new Map<string, Map<string, CursoElegido>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const els: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('student_electives')
      .select('slot_course_id, enrollment:academic_student_enrollments!enrollment_id(student_id, program_id), chosen:academic_courses!chosen_course_id(id, code, name)')
      .range(from, from + 999)
    els.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  for (const el of els) {
    if (!el.enrollment?.student_id || !el.enrollment?.program_id || !el.chosen) continue
    const k = `${el.enrollment.student_id}|${el.enrollment.program_id}`
    if (!out.has(k)) out.set(k, new Map())
    out.get(k)!.set(String(el.slot_course_id), { id: String(el.chosen.id), code: el.chosen.code, name: el.chosen.name })
  }
  return out
}

// ¿La asignatura ELEGIDA está cubierta? Misma vara que la malla: convalidada,
// o su mejor nota alcanza el mínimo. gradeRows = las notas del estudiante
// (retake_grade ?? final_grade), transferred = course_ids convalidados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function elegidaCubierta(chosen: CursoElegido, gradeRows: any[], transferred: Set<string>, categoryPassing: number | null): boolean {
  if (transferred.has(chosen.id)) return true
  const matches = gradeRows.filter(g => filaDeCurso(g, chosen))
  const values = matches.map(g => (g.retake_grade ?? g.final_grade)).filter((v: unknown): v is number => v != null)
  if (!values.length) return false
  const best = Math.max(...values)
  const bestRow = matches.find(g => Number(g.retake_grade ?? g.final_grade) === best)
  const passing = categoryPassing ?? bestRow?.passing_score
  return passing == null || best >= Number(passing)
}
