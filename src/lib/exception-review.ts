import Anthropic from '@anthropic-ai/sdk'

export interface ExceptionVerdict { decision: 'aceptada' | 'rechazada'; reason: string }

const SYSTEM = `Eres el asistente de cobranzas de Blackwell University. Un estudiante CON DEUDA VENCIDA pide una excepción temporal para recuperar su acceso al aula virtual (Moodle) durante 3 o 5 días, comprometiéndose a pagar en ese plazo. Debes evaluar su JUSTIFICACIÓN y decidir si se le concede.

Criterios para ACEPTAR: la justificación es coherente, específica y de buena fe (p. ej. un imprevisto económico, un pago en trámite/en camino, un problema puntual verificable, una fecha concreta de pago). Concede el beneficio de la duda ante explicaciones razonables.

Criterios para RECHAZAR: justificación vacía, evasiva, ofensiva, sin sentido, contradictoria, o que niega la deuda / se niega a pagar, o claramente un intento de eludir el pago sin intención real de regularizar.

Responde SOLO con un JSON válido, sin texto adicional:
{"decision":"aceptada|rechazada","reason":"<explicación breve al estudiante, en 2da persona, tono empático y claro, máximo 2 frases>"}
- Si aceptas: confirma la gracia y recuérdale su compromiso de pago en el plazo elegido.
- Si rechazas: explica con respeto por qué no procede y que puede escribir a Sofía para coordinar una solución.`

// Evalúa la justificación del estudiante. Degradación SEGURA: ante cualquier fallo
// NO se concede automáticamente — se rechaza y se deriva a un humano (Sofía).
export async function reviewJustification(input: {
  studentName: string; days: number; overdue: number; justification: string
}): Promise<ExceptionVerdict> {
  const fallback: ExceptionVerdict = {
    decision: 'rechazada',
    reason: 'No pudimos evaluar tu solicitud automáticamente en este momento. Escríbele a Sofía para que un asesor te ayude a coordinar una solución.',
  }
  try {
    if (!process.env.ANTHROPIC_API_KEY) return fallback
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Estudiante: ${input.studentName}\nDeuda vencida: $${input.overdue.toFixed(2)}\nDías de gracia solicitados: ${input.days} (compromiso de pago en ${input.days} días)\n\nJustificación del estudiante:\n"""${input.justification.slice(0, 2000)}"""`,
      }],
    })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return fallback
    const parsed = JSON.parse(m[0]) as ExceptionVerdict
    const decision = parsed.decision === 'aceptada' ? 'aceptada' : 'rechazada'
    const reason = String(parsed.reason ?? '').trim() || (decision === 'aceptada'
      ? 'Tu solicitud fue aprobada. Recuerda tu compromiso de pago dentro del plazo.'
      : 'Tu solicitud no procede. Escríbele a Sofía para coordinar una solución.')
    return { decision, reason }
  } catch {
    return fallback
  }
}
