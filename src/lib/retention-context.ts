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

import { filaDeCurso } from './course-match'
import { esIntento } from './grade-sources'

export interface RetentionContext {
  studentId: string
  name: string
  level: 1 | 2 | 3
  inactivityDays: number | null
  balance: number | null
  pending: number
  total: number
  // Asignaturas EMPEZADAS y sin terminar, con avance real. No es lo mismo que
  // "le faltan N": es el argumento de que no arranca de cero.
  started: number
  bestProgress: number | null
  campaign: string
  text: string
}

// Camila atiende VARIAS campañas por el mismo número. Su prompt define una
// misión distinta por campaña, así que necesita saber POR QUÉ escribió: sin
// esto negaría el motivo de su propio mensaje (p. ej. decirle "no soy cobranza"
// a quien acaba de recibir un aviso de cuota vencida).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function campaignOf(sb: any, studentId: string): Promise<string> {
  // El último contacto manda: es la campaña que originó esta conversación.
  const { data: cc } = await sb.from('campaign_contacts')
    .select('campaign_key, sent_at').eq('student_id', studentId)
    .order('sent_at', { ascending: false }).limit(1).maybeSingle()
  const { data: rc } = await sb.from('retention_contacts')
    .select('sent_at').eq('student_id', studentId).neq('status', 'failed')
    .order('sent_at', { ascending: false }).limit(1).maybeSingle()
  if (cc?.campaign_key && (!rc?.sent_at || String(cc.sent_at) >= String(rc.sent_at))) return cc.campaign_key
  return 'ausente'   // el motor de retención, o sin rastro: la campaña por defecto
}

const CAMPAIGN_LABEL: Record<string, string> = {
  ausente: 'AUSENTE (dejó de entrar al aula)',
  cobranza: 'COBRANZA (tiene una cuota vencida)',
  cashpay: 'CASHPAY (está al día y puede adelantar cuotas con descuento)',
  titulacion: 'TITULACIÓN (terminó su programa y no ha pedido su título)',
  iw: 'IW (se retiró definitivamente)',
  loa: 'LOA (en licencia, su plazo está por vencer)',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildRetentionContext(sb: any, studentId: string): Promise<RetentionContext | null> {
  const { data: s } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, situation').eq('id', studentId).maybeSingle()
  if (!s) return null

  const campaign = await campaignOf(sb, studentId).catch(() => 'ausente')

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
    const gradeRows = ((grades ?? []) as any[]).filter(g => esIntento(g))

    const { data: tcs } = await sb.from('transfer_credits').select('id').eq('student_id', studentId).in('dest_program_id', programIds)
    const tcIds = (tcs ?? []).map((t: { id: string }) => t.id)
    const { data: items } = tcIds.length
      ? await sb.from('transfer_credit_items').select('dest_course_id').in('transfer_credit_id', tcIds)
      : { data: [] }
    const transferred = new Set<string>(((items ?? []) as { dest_course_id: string }[]).map(i => i.dest_course_id).filter(Boolean))

    for (const c of malla) {
      if (transferred.has(c.id)) continue
      const matches = gradeRows.filter(g => filaDeCurso(g, c))
      const values = matches.map(g => g.retake_grade ?? g.final_grade).filter((v: number | null): v is number => v != null)
      if (!values.length) { pending++; continue }
      const best = Math.max(...values)
      const bestRow = matches.find(g => Number(g.retake_grade ?? g.final_grade) === best)
      const passing = bestRow?.passing_score ?? categoryPassing
      if (!(passing == null || best >= Number(passing))) pending++
    }
  }

  // --- asignaturas a medio hacer ---
  //
  // El estado pendiente significa "empezada y sin resolver": el acumulado aún
  // no llega al mínimo y todavía queda ponderación por rendir. Se exige avance
  // real (rendido > 0) porque una matrícula donde nunca entró SÍ es empezar de
  // cero, y prometerle lo contrario sería mentirle.
  let started = 0
  let bestProgress: number | null = null
  if (s.document_number) {
    const { data: enCurso } = await sb.from('academic_grades')
      .select('rendido_pct')
      .eq('document_number', s.document_number)
      .eq('estado_academico', 'pendiente')
      .gt('rendido_pct', 0)
    started = (enCurso ?? []).length
    for (const r of (enCurso ?? []) as { rendido_pct: number | null }[]) {
      const v = Number(r.rendido_pct ?? 0)
      if (bestProgress == null || v > bestProgress) bestProgress = Math.round(v)
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
    `- CAMPAÑA POR LA QUE ESCRIBISTE: ${CAMPAIGN_LABEL[campaign] ?? campaign.toUpperCase()}`,
    '  (tu misión y tu cierre los define esta campaña — no la contradigas)',
    `- Nombre: ${name}`,
    programName ? `- Programa: ${programName}` : null,
    days != null ? `- Días sin entrar al aula: ${days}` : '- Nunca ha entrado al aula',
    lastMoodle ? `- Última vez en el aula: ${lastMoodle}` : null,
    started > 0
      ? `- Asignaturas empezadas y sin terminar: ${started}` +
        (bestProgress != null ? ` (en la más avanzada lleva ${bestProgress}% del curso rendido)` : '') +
        ' — NO empieza de cero si vuelve'
      : null,
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

  return { studentId, name, level, inactivityDays: days, balance, pending, total, started, bestProgress, campaign, text: lines.join('\n') }
}
