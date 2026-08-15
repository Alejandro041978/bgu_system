import { filaDeCurso } from '@/lib/course-match'

// ---------------------------------------------------------------------------
// El acta personal: la malla del programa con el estado de cada asignatura.
//
// Vive aquí y no en la ruta porque la piden dos lugares con permisos distintos
// —Registros por student_id, y el propio estudiante por su sesión— y son la
// misma verdad. Duplicarla habría garantizado que un día dijeran cosas
// distintas sobre el mismo expediente.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface ActaRow {
  code: string | null; name: string; credits: number | null
  status: 'transfer' | 'validation' | 'aprobado' | 'desaprobado' | 'en_proceso' | 'pendiente'
  grade: number | null
  // ¿Está en su registro curricular? Una asignatura puede figurar como
  // 'pendiente' por dos razones opuestas: la tiene registrada y aún no la
  // empieza, o no la tiene (se retiró de ella). Lo primero se paga; lo
  // segundo no. Sin este dato el precio no puede distinguirlas.
  registrada: boolean
}
export interface ActaSummary {
  transfer: number; validation: number; aprobado: number
  desaprobado: number; en_proceso: number; pendiente: number; total: number
}
export interface Acta {
  student: { name: string; document: string | null }
  program: { name: string }
  courses: ActaRow[]
  summary: ActaSummary
}

export async function computeActa(sb: SB, studentId: string, programId: string): Promise<Acta | null> {
  const { data: student } = await sb.from('academic_students')
    .select('first_name, last_name, second_last_name, document_number').eq('id', studentId).maybeSingle()
  if (!student) return null
  const document = student.document_number

  const { data: program } = await sb.from('academic_programs').select('id, name, category_id').eq('id', programId).maybeSingle()
  let categoryPassing: number | null = null
  if (program?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', program.category_id).maybeSingle()
    categoryPassing = cat?.passing_score ?? null
  }

  const { data: courses } = await sb.from('academic_courses')
    .select('id, code, name, credits').eq('program_id', programId).order('code')

  // Notas reales (excluye convalidación y validación, que se resuelven aparte).
  // Las filas de plan SÍ entran: son parte del registro y de ellas depende que
  // una asignatura no empezada se distinga de una retirada.
  // Defensa: si aún no se corrió course_withdrawal.sql, reintenta sin el filtro
  // de retiradas para no romper el acta.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let grades: any[] | null = []
  if (document) {
    const base = () => sb.from('academic_grades')
      .select('course_id, course_code, course_name, final_grade, retake_grade, passing_score, estado_academico, source')
      .eq('document_number', document).neq('source', 'convalidacion').neq('source', 'validacion')
    const r = await base().is('withdrawn_at', null)
    grades = r.error ? (await base()).data : r.data
  }

  // ---------------------------------------------------------------------------
  // Qué asignaturas tiene REGISTRADAS. Sale del registro por asignatura, no de
  // que exista una fila en la tabla de notas.
  //
  // Es la diferencia entre "no la ha empezado" y "no la tiene": lo primero se
  // paga y lo segundo no, y de ahí sale el precio oficial. Deducirlo de la
  // existencia de una fila obligaba a inventar filas sin nota —4.111 de plan—
  // dentro de la tabla de calificaciones.
  //
  // Se comprobó matrícula a matrícula antes de cambiarlo: de 2.040, coinciden
  // 2.038. La única que se mueve es la de Pablo Cusi, y sube: cursa dos
  // programas que comparten asignaturas y hasta ahora se le contaban en uno
  // solo. La institución cobra en los dos (Dirección, 14-08-2026).
  // ---------------------------------------------------------------------------
  const { data: matriculas } = await sb.from('academic_course_enrollments')
    .select('course_id, status').eq('student_id', studentId)
  const registradas = new Set<string>()
  // Y si la está CURSANDO. Hasta ahora eso se deducía de que existiera una fila
  // de nota vacía: 6.638 inscripciones de SystemActiva sin calificar viven en la
  // tabla de calificaciones solo para sostener ese "en proceso". El registro ya
  // lo dice, y lo dice mejor.
  const cursando = new Set<string>()
  for (const m of (matriculas ?? []) as { course_id: string; status: string }[]) {
    if (m.status === 'retirada') continue
    registradas.add(String(m.course_id))
    if (m.status === 'en_curso') cursando.add(String(m.course_id))
  }

  const { data: tcs } = await sb.from('transfer_credits').select('id, kind')
    .eq('student_id', studentId).eq('dest_program_id', programId)
  const kindByTc = new Map<string, string>()
  for (const t of tcs ?? []) kindByTc.set(t.id, t.kind === 'validacion' ? 'validacion' : 'convalidacion')
  const tcIds = (tcs ?? []).map((t: { id: string }) => t.id)
  const { data: tItems } = tcIds.length
    ? await sb.from('transfer_credit_items').select('transfer_credit_id, dest_course_id, converted_grade').in('transfer_credit_id', tcIds)
    : { data: [] }
  const transferMap = new Map<string, { grade: number | null; kind: string }>()
  for (const it of tItems ?? []) if (it.dest_course_id) {
    transferMap.set(it.dest_course_id, { grade: it.converted_grade, kind: kindByTc.get(it.transfer_credit_id) ?? 'convalidacion' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradeRows = (grades ?? []) as any[]
  const summary = { transfer: 0, validation: 0, aprobado: 0, desaprobado: 0, en_proceso: 0, pendiente: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: ActaRow[] = (courses ?? []).map((c: any) => {
    // Registrada = está en su registro por asignatura, o se la convalidaron.
    // Ya no "tiene una fila en notas".
    const registrada = registradas.has(String(c.id)) || transferMap.has(c.id)
    const base = { code: c.code, name: c.name, credits: c.credits, registrada }
    if (transferMap.has(c.id)) {
      const tm = transferMap.get(c.id)!
      if (tm.kind === 'validacion') { summary.validation++; return { ...base, status: 'validation' as const, grade: tm.grade } }
      summary.transfer++
      return { ...base, status: 'transfer' as const, grade: tm.grade }
    }
    const matches = gradeRows.filter(g => filaDeCurso(g, c))
    // Una fila de plan no es actividad académica: la asignatura sigue
    // 'pendiente' para el estudiante, pero está EN su registro.
    const empezadas = matches.filter(g => g.source !== 'plan')
    const withValue = empezadas.map(g => ({ g, v: (g.retake_grade ?? g.final_grade) as number | null })).filter(x => x.v != null)
    if (withValue.length) {
      const best = withValue.reduce((a, b) => (Number(b.v) > Number(a.v) ? b : a))
      // La categoría MANDA. Antes era al revés y por eso el 75 heredado de
      // Activa pisaba el 70 configurado: la regla de la institución solo se
      // aplicaba a las notas que llegaban sin ella.
      const passing = categoryPassing ?? best.g.passing_score
      // El estado calculado manda sobre comparar la nota contra el mínimo: la
      // nota del campus es un acumulado sobre el 100% del curso, así que un
      // 6,33 de quien rindió dos quizzes no es un reprobado sino alguien que
      // está empezando.
      const est = (best.g as { estado_academico?: string | null }).estado_academico
      if (est === 'pendiente') { summary.en_proceso++; return { ...base, status: 'en_proceso' as const, grade: best.v } }
      const passed = est === 'aprobado' ? true
        : est === 'reprobado' ? false
        : (passing != null ? Number(best.v) >= Number(passing) : true)
      if (passed) { summary.aprobado++; return { ...base, status: 'aprobado' as const, grade: best.v } }
      summary.desaprobado++; return { ...base, status: 'desaprobado' as const, grade: best.v }
    }
    // "En proceso" sale del registro o de que exista una inscripción sin nota.
    // Las dos vías dicen lo mismo hoy; la segunda desaparece cuando esas 6.638
    // inscripciones salgan de la tabla de calificaciones, y por eso se pone
    // primero la que va a quedar.
    if (cursando.has(String(c.id)) || empezadas.length) {
      summary.en_proceso++
      return { ...base, status: 'en_proceso' as const, grade: null }
    }
    summary.pendiente++
    // registrada=false sólo si NO tiene ninguna fila: o se retiró de ella, o
    // nunca entró a su registro (un IW, que sí puede llevar menos).
    return { ...base, status: 'pendiente' as const, grade: null }
  })

  return {
    student: { name: [student.first_name, student.last_name, student.second_last_name].filter(Boolean).join(' '), document },
    program: { name: program?.name ?? '' },
    courses: rows,
    summary: { ...summary, total: rows.length },
  }
}

// Créditos que el estudiante LLEVA de este programa.
//
// Lleva TODO lo que está en su registro curricular (regla del usuario
// 2026-08-08): convalidadas, aprobadas, desaprobadas, en proceso y también las
// que aún no ha empezado. Un matriculado tiene la malla entera registrada y
// paga el programa entero.
//
// Lo único que NO cuenta es lo que salió de su registro: las asignaturas
// retiradas —el retiro baja el precio, esa es su razón de ser— y, en un IW, las
// que nunca llegaron a registrársele. Ambas caen en 'pendiente' sin fila, que
// es justo lo que distingue `registrada`.
//
// Se calcula, no se guarda. Un retiro o una convalidación cambian lo que lleva
// —a Milagros le cambió el precio con seis retiros de un martes por la tarde—,
// y un número congelado habría quedado mintiendo desde ese mismo minuto.
export function creditosQueLleva(acta: Acta): number {
  return acta.courses
    .filter(c => c.registrada)
    .reduce((s, c) => s + Number(c.credits ?? 0), 0)
}
