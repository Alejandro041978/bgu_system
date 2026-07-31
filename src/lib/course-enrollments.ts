// ---------------------------------------------------------------------------
// Matrícula por asignatura: resolución y reconstrucción.
//
// Una fila de academic_course_enrollments = un intento de un estudiante en una
// asignatura del plan. Es el padrón (quién debe estar en el aula), la llave de
// la política (un intento 2 es lo único que autoriza a Moodle a escribir sobre
// una asignatura que ya tiene nota de SystemActiva) y el origen del periodo.
//
// El emparejamiento nota → asignatura usa courseNameKey, el MISMO de
// course-match.ts. No se replica la regla aquí: si divergiera, el acta y la
// matrícula contarían asignaturas distintas para el mismo estudiante.
//
// Se acota al programa del estudiante antes de comparar nombres. Eso es lo que
// vuelve fiable un emparejamiento por texto: 262 de las 432 asignaturas
// comparten código con otra ("101" es el código de 54 asignaturas distintas),
// pero dentro de un mismo programa los nombres no colisionan.
// ---------------------------------------------------------------------------
import { courseNameKey } from './course-match'

export interface CursoMalla { id: string; program_id: string | null; name: string | null; code: string | null }
export interface NotaMin {
  external_id: string
  document_number: string | null
  course_name: string | null
  course_code: string | null
  final_grade: number | null
  retake_grade: number | null
  passing_score: number | null
  term_year: number | null
  term_block: string | null
  withdrawn_at: string | null
  synced_at: string | null
  source: string | null
}

export type MotivoSinResolver = 'sin_alumno' | 'sin_programa' | 'otro_programa' | 'fuera_de_malla'

export interface Resolucion {
  course_id: string | null
  program_id: string | null
  ambiguo: boolean
  motivo: MotivoSinResolver | null
}

// Índice de asignaturas por programa + nombre normalizado.
export function indexarMalla(courses: CursoMalla[]) {
  const porProgNombre = new Map<string, CursoMalla[]>()
  const porNombre = new Map<string, CursoMalla[]>()
  for (const c of courses) {
    const k = courseNameKey(c.name)
    if (!k) continue
    const pk = `${c.program_id}|${k}`
    if (!porProgNombre.has(pk)) porProgNombre.set(pk, [])
    porProgNombre.get(pk)!.push(c)
    if (!porNombre.has(k)) porNombre.set(k, [])
    porNombre.get(k)!.push(c)
  }
  return { porProgNombre, porNombre }
}

// A qué asignatura del plan pertenece esta nota.
export function resolverAsignatura(
  nota: { course_name: string | null },
  programasDelAlumno: string[] | null | undefined,
  idx: ReturnType<typeof indexarMalla>,
): Resolucion {
  if (!programasDelAlumno || !programasDelAlumno.length) {
    return { course_id: null, program_id: null, ambiguo: false, motivo: 'sin_programa' }
  }
  const k = courseNameKey(nota.course_name)
  if (!k) return { course_id: null, program_id: null, ambiguo: false, motivo: 'fuera_de_malla' }

  const hits: CursoMalla[] = []
  for (const p of programasDelAlumno) hits.push(...(idx.porProgNombre.get(`${p}|${k}`) ?? []))

  if (hits.length === 1) {
    return { course_id: hits[0].id, program_id: hits[0].program_id, ambiguo: false, motivo: null }
  }
  if (hits.length > 1) {
    // El alumno está en dos programas que comparten el nombre de la asignatura
    // (93 notas). Se elige de forma determinista —por id— y se marca ambigua
    // para que aparezca en la revisión, en vez de decidirlo en silencio.
    const elegido = [...hits].sort((a, b) => a.id.localeCompare(b.id))[0]
    return { course_id: elegido.id, program_id: elegido.program_id, ambiguo: true, motivo: null }
  }
  // La asignatura existe en la malla, pero de un programa que el alumno no
  // cursa. No se adivina: suele ser una matrícula de programa incompleta o un
  // upgrade, y asignarla al azar mete la nota en un plan que no es el suyo.
  if ((idx.porNombre.get(k) ?? []).length) {
    return { course_id: null, program_id: null, ambiguo: false, motivo: 'otro_programa' }
  }
  return { course_id: null, program_id: null, ambiguo: false, motivo: 'fuera_de_malla' }
}

// Estado del intento, leído de la nota.
export function estadoDeNota(n: NotaMin): 'en_curso' | 'aprobada' | 'reprobada' | 'retirada' {
  if (n.withdrawn_at) return 'retirada'
  const v = n.retake_grade ?? n.final_grade ?? null
  if (v == null) return 'en_curso'
  return Number(v) >= Number(n.passing_score ?? 70) ? 'aprobada' : 'reprobada'
}

// Orden de los intentos de un mismo estudiante en una misma asignatura: por
// periodo y, a igualdad, por fecha de sincronización. El intento 1 es el más
// antiguo. SystemActiva ya lo modelaba así — hay estudiantes con la misma
// asignatura en 2022, 2024 y 2025.
export function ordenarIntentos(notas: NotaMin[]): NotaMin[] {
  return [...notas].sort((a, b) => {
    const ay = a.term_year ?? 9999, by = b.term_year ?? 9999
    if (ay !== by) return ay - by
    const ab = String(a.term_block ?? ''), bb = String(b.term_block ?? '')
    if (ab !== bb) return ab.localeCompare(bb)
    return String(a.synced_at ?? '').localeCompare(String(b.synced_at ?? ''))
  })
}
