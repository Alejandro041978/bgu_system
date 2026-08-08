// ---------------------------------------------------------------------------
// Completar el registro curricular de un matriculado.
//
// Regla de la institución: quien está matriculado en un programa tiene en su
// registro las asignaturas de su malla — TODAS, sea cual sea su estado. Sólo un
// retiro institucional (IW) justifica que falten.
//
// Hasta ahora el registro sólo contenía lo que SystemActiva había inscrito. Un
// bachiller que convalidó 20 y cursó 10 aparecía con un plan de 30 asignaturas
// y las 10 finales sencillamente no existían para nadie: ni para el acta, ni
// para el padrón, ni para Registros.
//
// Las filas que faltan nacen con source='plan': ocupan su lugar en el registro
// sin fingir actividad académica. No tienen nota, ni periodo, ni aula, y el
// resto del ERP las ignora (ver grade-sources.ts) — en particular el precio
// oficial, que sale de lo que el estudiante LLEVA y no de lo que le queda.
//
// Cuando el estudiante empieza de verdad la asignatura, la importación de
// Moodle no crea una fila nueva: resolveImportTarget encuentra ésta vacía y la
// RELLENA (action 'fill'). Por eso el plan no duplica nada.
// ---------------------------------------------------------------------------
import { courseNameKey } from './course-match'
import { FUENTE_PLAN } from './grade-sources'
import { stableUuid } from './grades-write'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

// Situaciones que NO obligan a tener la malla completa.
export const SITUACIONES_EXENTAS = ['retiro_permanente']

export interface Hueco { course_id: string; code: string | null; name: string; credits: number | null }

// Qué asignaturas de la malla no tienen ninguna fila en el registro del
// estudiante: ni nota (de cualquier origen), ni convalidación, ni plan.
export function huecosDeRegistro(
  malla: { id: string; code: string | null; name: string; credits: number | null }[],
  notas: { course_name: string | null }[],
  convalidadas: { dest_course_id: string | null; dest_course_name: string | null }[],
): Hueco[] {
  const cubierto = new Set<string>()
  for (const n of notas) cubierto.add(courseNameKey(n.course_name))
  const porId = new Set<string>()
  for (const c of convalidadas) {
    if (c.dest_course_id) porId.add(c.dest_course_id)
    cubierto.add(courseNameKey(c.dest_course_name))
  }
  return malla
    .filter(c => !porId.has(c.id) && !cubierto.has(courseNameKey(c.name)))
    .map(c => ({ course_id: c.id, code: c.code, name: c.name, credits: c.credits }))
}

// external_id determinista (la columna es uuid): correr esto dos veces no
// duplica nada, y si la asignatura ya nació por otra vía el upsert no la pisa.
export function idDePlan(documento: string, courseId: string): string {
  return stableUuid(`plan:${documento}:${courseId}`)
}

export function filaDePlan(
  estudiante: { id: string; document_number: string; email: string | null; nombre: string },
  hueco: Hueco,
): Record<string, unknown> {
  return {
    external_id: idDePlan(estudiante.document_number, hueco.course_id),
    document_number: estudiante.document_number,
    email: estudiante.email,
    student_name: estudiante.nombre,
    course_id: hueco.course_id,
    course_code: hueco.code,
    course_name: hueco.name,
    credits: hueco.credits,
    term_year: null, term_block: null,
    final_grade: null, retake_grade: null, passing_score: null,
    source: FUENTE_PLAN,
    // 'no_iniciada' no es 'pendiente': pendiente en esta tabla significa
    // "cursando, sin concluir". Esto es "todavía no empieza".
    estado_academico: 'no_iniciada',
    synced_at: new Date().toISOString(),
  }
}

// Completa el registro de UNA matrícula. Se llama al matricular, para que el
// desvío no vuelva a acumularse: hasta hoy el registro se llenaba sólo con lo
// que SystemActiva iba inscribiendo, y quien nunca llegó al último año se
// quedó sin esas asignaturas para siempre.
export async function completarRegistroDeMatricula(
  sb: SB, studentId: string, programId: string,
): Promise<{ creadas: number; error?: string }> {
  const { data: s } = await sb.from('academic_students')
    .select('id, document_number, email, first_name, last_name, second_last_name, situation')
    .eq('id', studentId).maybeSingle()
  if (!s?.document_number) return { creadas: 0 }
  if (SITUACIONES_EXENTAS.includes(String(s.situation ?? ''))) return { creadas: 0 }

  const { data: malla } = await sb.from('academic_courses')
    .select('id, code, name, credits').eq('program_id', programId)
  if (!(malla ?? []).length) return { creadas: 0 }

  const { data: notas } = await sb.from('academic_grades')
    .select('course_name, source').eq('document_number', s.document_number)
  const { data: tcs } = await sb.from('transfer_credits')
    .select('id').eq('student_id', studentId).eq('dest_program_id', programId).eq('status', 'active')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = []
  if ((tcs ?? []).length) {
    const { data } = await sb.from('transfer_credit_items')
      .select('dest_course_id, dest_course_name').in('transfer_credit_id', (tcs ?? []).map((t: { id: string }) => t.id))
    items = data ?? []
  }

  const huecos = huecosDeRegistro(malla ?? [], notas ?? [], items)
  if (!huecos.length) return { creadas: 0 }
  const est = {
    id: s.id, document_number: String(s.document_number), email: s.email ?? null,
    nombre: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' '),
  }
  return escribirPlan(sb, huecos.map(h => filaDePlan(est, h)))
}

// Escribe las filas que falten. ignoreDuplicates: si alguien ya cursó la
// asignatura entre la lectura y la escritura, gana la fila real.
export async function escribirPlan(sb: SB, filas: Record<string, unknown>[]): Promise<{ creadas: number; error?: string }> {
  let creadas = 0
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500)
    const { error } = await sb.from('academic_grades').upsert(lote, { onConflict: 'external_id', ignoreDuplicates: true })
    if (error) return { creadas, error: error.message }
    creadas += lote.length
  }
  return { creadas }
}
