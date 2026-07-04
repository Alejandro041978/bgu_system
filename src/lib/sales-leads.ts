import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type LeadStage = 'nuevo' | 'contactable' | 'calificado' | 'interesado' | 'inscrito' | 'descartado'

const STAGE_ORDER: LeadStage[] = ['nuevo', 'contactable', 'calificado', 'interesado', 'inscrito']

/** Devuelve la etapa "más avanzada" entre dos (descartado se respeta si es el nuevo valor). */
function higherStage(a: LeadStage | null | undefined, b: LeadStage | null | undefined): LeadStage {
  if (b === 'descartado') return 'descartado'
  if (a === 'descartado') return a
  const ia = a ? STAGE_ORDER.indexOf(a) : 0
  const ib = b ? STAGE_ORDER.indexOf(b) : 0
  return STAGE_ORDER[Math.max(ia, ib, 0)] ?? 'nuevo'
}

interface Extracted {
  name: string | null
  email: string | null
  program_interest: string | null
  prior_studies: string | null
  stage: LeadStage
  qualified: boolean | null
  notes: string | null
}

const EXTRACTOR_PROMPT = `Analiza esta conversación entre Antonella (asesora de ventas de una universidad) y un posible estudiante (lead). Extrae los datos del prospecto y determina en qué ETAPA del embudo de ventas se encuentra.

ETAPAS (elige la MÁS AVANZADA que ya se haya alcanzado):
- "nuevo": aún no responde o no se sabe nada.
- "contactable": la persona respondió y muestra interés en recibir información.
- "calificado": se determinó que CUMPLE los requisitos académicos del programa que le interesa.
- "interesado": expresó voluntad o intención de iniciar/inscribirse en el programa.
- "inscrito": confirmó que ya llenó la solicitud de admisión (formulario).
- "descartado": no cumple requisitos y no hay alternativa, o dijo que no desea continuar.

Requisitos por nivel (para calificar):
- Bachelor: secundaria/enseñanza media concluida.
- Master: título universitario (bachiller universitario o título profesional).
- Doctorado: maestría concluida.

Responde SOLO con un JSON válido con esta estructura exacta:
{"name": string|null, "email": string|null, "program_interest": string|null, "prior_studies": string|null, "stage": "nuevo"|"contactable"|"calificado"|"interesado"|"inscrito"|"descartado", "qualified": true|false|null, "notes": string|null}

Usa null cuando el dato no se haya mencionado. "notes" es un resumen breve (1 frase) del estado del lead.`

/**
 * Analiza la conversación, extrae los datos del prospecto y los guarda/actualiza
 * en sales_leads. Fire-and-forget: nunca lanza (no debe afectar el chat).
 * `contactKey` es la clave única del lead (teléfono en WhatsApp, "web:<sessionId>" en web).
 */
export async function extractAndSaveLead(
  messages: { role: string; content: string }[],
  botKey: string,
  contactKey: string,
  extra?: { phone?: string | null; email?: string | null }
): Promise<void> {
  try {
    if (!process.env.ANTHROPIC_API_KEY || messages.length === 0) return

    const transcript = messages
      .filter(m => m.content)
      .map(m => `${m.role === 'user' ? 'Prospecto' : 'Antonella'}: ${m.content}`)
      .join('\n')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      system: EXTRACTOR_PROMPT,
      messages: [{ role: 'user', content: transcript.slice(0, 12000) }],
    })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return
    const data = JSON.parse(jsonMatch[0]) as Extracted

    const sb = db()

    // Merge con el lead existente (no sobreescribir datos con null)
    const { data: existing } = await sb
      .from('sales_leads')
      .select('*')
      .eq('phone', contactKey)
      .eq('bot_key', botKey)
      .maybeSingle()

    const merged = {
      bot_key: botKey,
      phone: contactKey,
      name: data.name ?? existing?.name ?? null,
      email: data.email ?? extra?.email ?? existing?.email ?? null,
      program_interest: data.program_interest ?? existing?.program_interest ?? null,
      prior_studies: data.prior_studies ?? existing?.prior_studies ?? null,
      stage: higherStage(existing?.stage, data.stage),
      qualified: data.qualified ?? existing?.qualified ?? null,
      notes: data.notes ?? existing?.notes ?? null,
      meta: { ...(existing?.meta ?? {}), real_phone: extra?.phone ?? existing?.meta?.real_phone ?? null },
      updated_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    }

    await sb.from('sales_leads').upsert(merged, { onConflict: 'phone,bot_key' })
  } catch (err) {
    console.error('extractAndSaveLead error:', err)
  }
}
