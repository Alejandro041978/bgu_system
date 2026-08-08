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
  notas: { course_name: string | null; course_id?: string | null }[],
  convalidadas: { dest_course_id: string | null; dest_course_name: string | null }[],
): Hueco[] {
  const porId = new Set<string>()
  const porNombre = new Set<string>()
  // Una nota resuelta manda por course_id. Por nombre sólo cuando no lo tiene:
  // los nombres se repiten ENTRE programas ("Introduction to Psychology" está
  // en dos mallas), así que emparejar siempre por nombre le daba por cubierta
  // a un estudiante la asignatura del programa nuevo porque la cursó en otro.
  for (const n of notas) {
    if (n.course_id) porId.add(n.course_id)
    else porNombre.add(courseNameKey(n.course_name))
  }
  for (const c of convalidadas) {
    if (c.dest_course_id) porId.add(c.dest_course_id)
    else porNombre.add(courseNameKey(c.dest_course_name))
  }
  return malla
    .filter(c => !porId.has(c.id) && !porNombre.has(courseNameKey(c.name)))
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
    .select('course_name, course_id, source').eq('document_number', s.document_number)
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

// ---------------------------------------------------------------------------
// Barrido: TODAS las matrículas con el registro incompleto.
//
// Vive aquí y no en la ruta porque lo usan tres sitios —la página de cobertura,
// el cron nocturno y el gatillo de "asignatura nueva en la malla"— y tienen que
// contar lo mismo. Una segunda copia de esta cuenta habría acabado diciendo que
// no falta nadie mientras la otra decía que faltan doscientos.
// ---------------------------------------------------------------------------
export interface MatriculaIncompleta {
  enrollment_id: string; student_id: string; program_id: string
  documento: string | null; estudiante: string; email: string | null
  programa: string; categoria: string; situacion: string; exenta: boolean
  malla: number; faltan: number; huecos: Hueco[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, tabla: string, cols: string): Promise<any[]> {
  const out: unknown[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(d, d + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

export async function analizarCobertura(sb: SB): Promise<MatriculaIncompleta[]> {
  const [cats, progs, courses, studs, enrs, grades, tcs, tItems] = await Promise.all([
    todo(sb, 'academic_programs_category', 'id, name'),
    todo(sb, 'academic_programs', 'id, name, category_id'),
    todo(sb, 'academic_courses', 'id, program_id, name, code, credits'),
    todo(sb, 'academic_students', 'id, document_number, first_name, last_name, second_last_name, email, situation'),
    todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, status'),
    todo(sb, 'academic_grades', 'document_number, course_name, course_id, source'),
    todo(sb, 'transfer_credits', 'id, student_id, dest_program_id, status'),
    todo(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id, dest_course_name'),
  ])

  const catName = new Map(cats.map(c => [c.id, c.name]))
  const prog = new Map(progs.map(p => [p.id, p]))
  const malla = new Map<string, typeof courses>()
  for (const c of courses) {
    if (!malla.has(c.program_id)) malla.set(c.program_id, [])
    malla.get(c.program_id)!.push(c)
  }
  const stu = new Map(studs.map(s => [s.id, s]))

  const notasDe = new Map<string, { course_name: string | null; course_id: string | null }[]>()
  for (const g of grades) {
    if (g.source === 'convalidacion' || g.source === 'validacion') continue
    const d = String(g.document_number ?? '')
    if (!notasDe.has(d)) notasDe.set(d, [])
    notasDe.get(d)!.push(g)
  }
  const itemsDe = new Map<string, typeof tItems>()
  for (const i of tItems) {
    if (!itemsDe.has(i.transfer_credit_id)) itemsDe.set(i.transfer_credit_id, [])
    itemsDe.get(i.transfer_credit_id)!.push(i)
  }
  const convDe = new Map<string, typeof tItems>()
  for (const t of tcs) {
    if (t.status !== 'active') continue
    const k = `${t.student_id}|${t.dest_program_id}`
    if (!convDe.has(k)) convDe.set(k, [])
    convDe.get(k)!.push(...(itemsDe.get(t.id) ?? []))
  }

  const out: MatriculaIncompleta[] = []
  for (const e of enrs) {
    const s = stu.get(e.student_id)
    const p = prog.get(e.program_id)
    if (!s || !p) continue
    const cursos = malla.get(e.program_id) ?? []
    if (!cursos.length) continue
    const huecos = huecosDeRegistro(cursos, notasDe.get(String(s.document_number ?? '')) ?? [], convDe.get(`${e.student_id}|${e.program_id}`) ?? [])
    if (!huecos.length) continue
    out.push({
      enrollment_id: e.id, student_id: s.id, program_id: p.id,
      documento: s.document_number ?? null,
      estudiante: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' '),
      email: s.email ?? null,
      programa: p.name, categoria: catName.get(p.category_id) ?? '—',
      situacion: s.situation ?? 'activo',
      exenta: SITUACIONES_EXENTAS.includes(String(s.situation ?? '')),
      malla: cursos.length, faltan: huecos.length, huecos,
    })
  }
  return out
}

// Completa las que se le pasen (o todas las no exentas). Devuelve el detalle
// para que el cron pueda dejar rastro de qué llenó y a quién.
export async function completarCobertura(
  sb: SB, filtro?: (m: MatriculaIncompleta) => boolean,
): Promise<{ matriculas: number; asignaturas: number; omitidas_por_iw: number; error?: string }> {
  const todas = await analizarCobertura(sb)
  const elegidas = todas.filter(m => (filtro ? filtro(m) : true))
  const omitidas = elegidas.filter(m => m.exenta).length
  const aplicables = elegidas.filter(m => !m.exenta)

  const filas: Record<string, unknown>[] = []
  for (const m of aplicables) {
    if (!m.documento) continue
    const est = { id: m.student_id, document_number: m.documento, email: m.email, nombre: m.estudiante }
    for (const h of m.huecos) filas.push(filaDePlan(est, h))
  }
  const r = await escribirPlan(sb, filas)
  return { matriculas: aplicables.length, asignaturas: r.creadas, omitidas_por_iw: omitidas, error: r.error }
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
