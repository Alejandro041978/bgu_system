// ---------------------------------------------------------------------------
// Contexto que recibe Camila antes de escribirle a un estudiante.
//
// Se inyecta como bloque de texto en el system prompt (igual que studentContext
// en /api/chat). El prompt le prohíbe recitarlo: es para que entienda con quién
// habla, no para que se lo lea como un informe.
//
// El dato de "evaluaciones pendientes" es el que más pesa: la objeción más común
// es la falta de tiempo, y casi siempre el estudiante cree que le falta mucho
// más de lo que realmente le falta. Poder decirle "te faltan 3, no 12" es lo que
// desbloquea la conversación.
// ---------------------------------------------------------------------------

import { sameCourse } from './course-match'

export interface RetentionContext {
  studentId: string
  name: string
  level: 1 | 2 | 3
  inactivityDays: number | null
  balance: number | null
  pending: number
  total: number
  text: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildRetentionContext(sb: any, studentId: string): Promise<RetentionContext | null> {
  const { data: s } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, situation').eq('id', studentId).maybeSingle()
  if (!s) return null

  const { data: tr } = await sb.from('student_tracking')
    .select('*').eq('student_id', studentId).maybeSingle()

  // --- programa y malla ---
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('program_id, program:academic_programs(name, category_id)').eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrolls = (enr ?? []) as any[]
  const programName = enrolls[0]?.program?.name ?? null
  const programIds = enrolls.map(e => e.program_id).filter(Boolean)

  // Nota aprobatoria de la categoría (respaldo cuando la nota no la trae)
  let categoryPassing: number | null = null
  if (enrolls[0]?.program?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category')
      .select('passing_score').eq('id', enrolls[0].program.category_id).maybeSingle()
    categoryPassing = cat?.passing_score ?? null
  }

  // --- evaluaciones pendientes: malla no cubierta por nota ni convalidación ---
  let pending = 0, total = 0
  if (programIds.length) {
    const { data: courses } = await sb.from('academic_courses').select('*').in('program_id', programIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const malla = ((courses ?? []) as any[]).filter(c => c.graduation_requirement !== false)
    total = malla.length

    const { data: grades } = await sb.from('academic_grades')
      .select('course_code, course_name, final_grade, retake_grade, passing_score, source')
      .eq('document_number', s.document_number)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gradeRows = ((grades ?? []) as any[]).filter(g => g.source !== 'convalidacion' && g.source !== 'validacion')

    const { data: tcs } = await sb.from('transfer_credits').select('id').eq('student_id', studentId).in('dest_program_id', programIds)
    const tcIds = (tcs ?? []).map((t: { id: string }) => t.id)
    const { data: items } = tcIds.length
      ? await sb.from('transfer_credit_items').select('dest_course_id').in('transfer_credit_id', tcIds)
      : { data: [] }
    const transferred = new Set<string>(((items ?? []) as { dest_course_id: string }[]).map(i => i.dest_course_id).filter(Boolean))

    for (const c of malla) {
      if (transferred.has(c.id)) continue
      const matches = gradeRows.filter(g =>
        (c.code && g.course_code && String(g.course_code) === String(c.code)) ||
        sameCourse(g.course_name, c.name))
      const values = matches.map(g => g.retake_grade ?? g.final_grade).filter((v: number | null): v is number => v != null)
      if (!values.length) { pending++; continue }
      const best = Math.max(...values)
      const bestRow = matches.find(g => Number(g.retake_grade ?? g.final_grade) === best)
      const passing = bestRow?.passing_score ?? categoryPassing
      if (!(passing == null || best >= Number(passing))) pending++
    }
  }

  // --- nivel ---
  const days = tr?.inactivity_days ?? null
  // Nivel 3 = prometió volver y no volvió. Pesa más que los días de ausencia:
  // el reclamo tiene que ser sobre el compromiso incumplido, no sobre la ausencia.
  const brokeCommitment = !!tr?.commitment_date && tr?.commitment_kept === false
  const level: 1 | 2 | 3 = brokeCommitment ? 3 : (days != null && days >= 14 ? 2 : 1)

  const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || 'el estudiante'
  const balance = tr?.balance ?? null
  const lastMoodle = tr?.last_moodle_access ? new Date(tr.last_moodle_access).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) : null

  const lines = [
    'CONTEXTO DEL ESTUDIANTE (para que entiendas su situación; NO se lo recites):',
    `- Nombre: ${name}`,
    programName ? `- Programa: ${programName}` : null,
    days != null ? `- Días sin entrar al aula: ${days}` : '- Nunca ha entrado al aula',
    lastMoodle ? `- Última vez en el aula: ${lastMoodle}` : null,
    balance != null
      ? (balance > 0.005
        ? `- Saldo pendiente: ${balance.toFixed(2)} USD (puedes hablarlo y ofrecer opciones; NUNCA como amenaza)`
        : '- No tiene deuda (si menciona el dinero como traba, aclárale que está al día)')
      : null,
    total ? `- Evaluaciones: le faltan ${pending} de ${total} para completar su programa` : null,
    pending > 0 && pending <= 3 ? '  (le falta MUY poco: díselo, es tu mejor argumento)' : null,
    `- NIVEL DE CONTACTO: ${level}`,
    level === 3 ? `  Prometió volver el ${tr?.commitment_date} y no entró. Recuérdaselo con respeto, sin reproche.` : null,
    level === 2 ? '  Lleva 14 días o más fuera: cálida pero firme. Igual: primero pregunta, después advierte.' : null,
    level === 1 ? '  Ausencia reciente: cercana y curiosa. Solo pregunta qué pasó.' : null,
  ].filter(Boolean)

  return { studentId, name, level, inactivityDays: days, balance, pending, total, text: lines.join('\n') }
}
