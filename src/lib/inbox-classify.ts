import Anthropic from '@anthropic-ai/sdk'

export interface InboundClassification { language: 'es' | 'en' | 'pt' | 'other'; topic: string }

const TOPICS = ['pagos', 'notas', 'admision', 'asistencia', 'tramites', 'documentos', 'capstone', 'tecnico', 'otro']

const SYSTEM = `Clasifica el siguiente mensaje de un estudiante o interesado a una universidad. Devuelve SOLO un JSON válido:
{"language":"es|en|pt|other","topic":"pagos|notas|admision|asistencia|tramites|documentos|capstone|tecnico|otro"}
- language: idioma principal del mensaje (es=español, en=inglés, pt=portugués, other=otro).
- topic: el tema más probable (pagos=cobros/matrícula/Flywire; notas=calificaciones/rendimiento; admision=inscripción/requisitos; asistencia=consulta general/orientación; tramites=solicitudes administrativas/constancias; documentos=emisión de certificados/títulos/diplomas/actas; capstone=proyecto final de grado/tesis/capstone project y sus entregas o asesorías; tecnico=acceso/plataforma; otro=si no encaja).`

/**
 * Clasifica un mensaje entrante por idioma y tema. Degradación segura:
 * si falla, devuelve español/otro para no bloquear la ingesta.
 */
export async function classifyInbound(subject: string, body: string): Promise<InboundClassification> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { language: 'es', topic: 'otro' }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Asunto: ${subject}\n\n${body.slice(0, 3000)}` }],
    })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return { language: 'es', topic: 'otro' }
    const parsed = JSON.parse(m[0]) as InboundClassification
    const language = (['es', 'en', 'pt', 'other'].includes(parsed.language) ? parsed.language : 'es') as InboundClassification['language']
    const topic = TOPICS.includes(parsed.topic) ? parsed.topic : 'otro'
    return { language, topic }
  } catch {
    return { language: 'es', topic: 'otro' }
  }
}
