// ---------------------------------------------------------------------------
// Clasificación de Camila: el código [[R: ...]] que cierra cada respuesta.
//
// Ese código es el verdadero producto del bot: es la CAUSA de deserción, que
// hoy no existe en ningún registro (la planilla distingue IW Administrativo de
// Voluntario, pero nunca el porqué).
//
// Dos reglas que no se negocian:
//   1. El código JAMÁS puede llegarle al estudiante -> stripOutcome() se aplica
//      siempre antes de enviar, incluso si no se logra parsear.
//   2. 'anuncia_retiro' abre la solicitud de la Fase B: el bot no gestiona el
//      retiro, lo pasa a la llamada humana.
// ---------------------------------------------------------------------------

export type OutcomeCode =
  | 'conversando' | 'compromiso' | 'objecion_deuda' | 'objecion_tiempo'
  | 'objecion_salud' | 'objecion_dificultad' | 'objecion_acceso'
  | 'anuncia_retiro' | 'no_contactar'

export interface Outcome {
  code: OutcomeCode
  fecha?: string          // compromiso: AAAA-MM-DD
  tipo?: 'LOA' | 'IW'     // anuncia_retiro
}

const CODES: OutcomeCode[] = ['conversando', 'compromiso', 'objecion_deuda', 'objecion_tiempo',
  'objecion_salud', 'objecion_dificultad', 'objecion_acceso', 'anuncia_retiro', 'no_contactar']

// Captura cualquier [[...]] al final, aunque venga con formato imperfecto.
const MARKER = /\[\[\s*R\s*:\s*([^\]]*)\]\]/gi

/** Quita el código del texto. Se aplica SIEMPRE antes de enviar. */
export function stripOutcome(text: string): string {
  return text.replace(MARKER, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Lee el código. Devuelve null si el bot no lo emitió o es irreconocible. */
export function parseOutcome(text: string): Outcome | null {
  const hits = [...String(text ?? '').matchAll(MARKER)]
  if (!hits.length) return null
  const raw = hits[hits.length - 1][1]   // el último gana
  const parts = raw.split('|').map(p => p.trim())
  const code = parts[0].toLowerCase().replace(/\s+/g, '_') as OutcomeCode
  if (!CODES.includes(code)) return null

  const out: Outcome = { code }
  for (const p of parts.slice(1)) {
    const m = p.match(/^(\w+)\s*:\s*(.+)$/)
    if (!m) continue
    const k = m[1].toLowerCase(), v = m[2].trim()
    if (k === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.fecha = v
    if (k === 'tipo' && /^(LOA|IW)$/i.test(v)) out.tipo = v.toUpperCase() as 'LOA' | 'IW'
  }
  return out
}

/** Divide la respuesta en lo que se envía y lo que se registra. */
export function splitReply(text: string): { reply: string; outcome: Outcome | null } {
  return { reply: stripOutcome(text), outcome: parseOutcome(text) }
}

const OBJECTION_OF: Partial<Record<OutcomeCode, string>> = {
  objecion_deuda: 'deuda', objecion_tiempo: 'tiempo', objecion_salud: 'salud',
  objecion_dificultad: 'dificultad', objecion_acceso: 'acceso',
}

/**
 * Registra el resultado y dispara lo que corresponda.
 * Devuelve qué se hizo, para el log.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordOutcome(sb: any, studentId: string, outcome: Outcome): Promise<{ saved: boolean; requestId?: string; note: string }> {
  const patch: Record<string, unknown> = {
    last_outcome: outcome.code,
    last_outcome_at: new Date().toISOString(),
  }

  // Respondió: se reinicia la cadencia de plantillas (ya estamos conversando).
  if (outcome.code !== 'no_contactar') patch.contact_attempts = 0

  if (outcome.code === 'compromiso' && outcome.fecha) {
    patch.commitment_date = outcome.fecha
    patch.commitment_at = new Date().toISOString()
    patch.commitment_kept = null   // lo resuelve el verificador mirando Moodle
  }
  if (outcome.code === 'no_contactar') patch.do_not_contact = true

  await sb.from('student_tracking').update(patch).eq('student_id', studentId)

  // Anuncia retiro -> expediente para la llamada humana. Camila no gestiona retiros.
  if (outcome.code === 'anuncia_retiro') {
    const { data: abierta } = await sb.from('withdrawal_requests')
      .select('id').eq('student_id', studentId).neq('stage', 'resuelto').neq('stage', 'anulado').maybeSingle()
    if (abierta) return { saved: true, requestId: abierta.id, note: 'Ya tenía un expediente abierto' }

    const { data: tr } = await sb.from('student_tracking')
      .select('inactivity_days, balance').eq('student_id', studentId).maybeSingle()
    const { data: nueva } = await sb.from('withdrawal_requests').insert({
      student_id: studentId, origin: 'bot', requested_type: outcome.tipo ?? null,
      inactivity_days: tr?.inactivity_days ?? null, balance: tr?.balance ?? null,
      stage: 'llamada_pendiente',
      reason: 'Anunciado en la conversación con Camila.',
    }).select('id').single()
    return { saved: true, requestId: nueva?.id, note: 'Expediente abierto para llamada humana' }
  }

  const obj = OBJECTION_OF[outcome.code]
  return { saved: true, note: obj ? `Traba detectada: ${obj}` : outcome.code }
}
