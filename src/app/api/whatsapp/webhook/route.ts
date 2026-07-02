import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createZohoTicket } from '@/app/api/chat/route'
import crypto from 'crypto'

export const maxDuration = 60

// ── DB ───────────────────────────────────────────────────────────────────────
const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Sofia prompt ─────────────────────────────────────────────────────────────
const FALLBACK_PROMPT = `Eres Sofia, asistente virtual de Blackwell Global University (BGU).
Ayudas a estudiantes con consultas sobre programas académicos, matrículas, pagos, trámites y más.
Detecta automáticamente el idioma en que el estudiante escribe y responde siempre en ese mismo idioma.
REGLAS SOBRE TICKETS:
- NUNCA propongas un ticket como cierre genérico.
- SOLO propón ticket cuando no puedas resolver la consulta.
- Antes de proponer, pregunta: "¿Te gustaría que cree un ticket de soporte? ¿Estás de acuerdo?"
- NUNCA crees el ticket sin confirmación explícita del estudiante.
- Si el estudiante dice que sí, usa la herramienta propose_ticket.`

async function getMasterPrompt(): Promise<string> {
  const { data } = await db()
    .from('ai_master_prompt')
    .select('prompt')
    .eq('id', 1)
    .single()
  return (data as { prompt?: string } | null)?.prompt ?? FALLBACK_PROMPT
}

// ── Tool definition ──────────────────────────────────────────────────────────
const TICKET_TOOL: Anthropic.Tool = {
  name: 'propose_ticket',
  description: 'Úsala SOLO cuando el estudiante haya dado su acuerdo explícito para crear un ticket de soporte.',
  input_schema: {
    type: 'object' as const,
    properties: {
      subject:      { type: 'string', description: 'Asunto breve del ticket' },
      description:  { type: 'string', description: 'Descripción detallada del problema' },
      contactName:  { type: 'string', description: 'Nombre completo del estudiante' },
      contactEmail: { type: 'string', description: 'Email del estudiante' },
      phone:        { type: 'string', description: 'Teléfono del estudiante' },
    },
    required: ['subject', 'description'],
  },
}

// ── Session helpers ──────────────────────────────────────────────────────────
interface Message { role: 'user' | 'assistant'; content: string }
interface PendingTicket { subject: string; description: string; contactName?: string; contactEmail?: string; phone?: string }
interface Session { messages: Message[]; pendingTicket?: PendingTicket }

const MAX_HISTORY = 20

async function getSession(phone: string): Promise<Session> {
  const { data } = await db()
    .from('whatsapp_sessions')
    .select('messages, pending_ticket')
    .eq('phone', phone)
    .single()
  const row = data as { messages?: Message[]; pending_ticket?: PendingTicket } | null
  return {
    messages: row?.messages ?? [],
    pendingTicket: row?.pending_ticket ?? undefined,
  }
}

async function saveSession(phone: string, session: Session) {
  await db().from('whatsapp_sessions').upsert(
    {
      phone,
      messages: session.messages.slice(-MAX_HISTORY),
      pending_ticket: session.pendingTicket ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'phone' }
  )
}

// ── Twilio helpers ───────────────────────────────────────────────────────────
async function sendWhatsApp(to: string, body: string) {
  const sid   = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const from  = process.env.TWILIO_WHATSAPP_NUMBER! // e.g. whatsapp:+14155238886

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  })
}

function validateTwilioSignature(req: NextRequest, params: Record<string, string>): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const signature = req.headers.get('x-twilio-signature') ?? ''
  if (!signature) return false

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`
  const payload = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url)
  const expected = crypto.createHmac('sha1', authToken).update(payload).digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// Split long text into ≤1500-char chunks at newline boundaries
function splitMessage(text: string, max = 1500): string[] {
  const chunks: string[] = []
  while (text.length > max) {
    let idx = text.lastIndexOf('\n', max)
    if (idx < 100) idx = max
    chunks.push(text.slice(0, idx))
    text = text.slice(idx).trimStart()
  }
  if (text) chunks.push(text)
  return chunks
}

const twimlOk = () =>
  new NextResponse('<Response/>', {
    headers: { 'Content-Type': 'text/xml' },
  })

// ── Webhook handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Parse Twilio form data
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((v, k) => { params[k] = v.toString() })

  const from = params['From']  // "whatsapp:+51987654321"
  const body = params['Body']?.trim()
  const accountSid = params['AccountSid']

  // Basic validation: must come from our Twilio account
  if (!from || !body || accountSid !== process.env.TWILIO_ACCOUNT_SID) {
    return twimlOk()
  }

  // Cryptographic signature validation in production
  if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req, params)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const session = await getSession(from)
    const lower = body.toLowerCase().trim()

    // ── Pending ticket confirmation flow ─────────────────────────────────────
    if (session.pendingTicket) {
      const yes = ['sí', 'si', 'yes', 'confirmo', 'confirmar', 'ok', '👍'].includes(lower)
      const no  = ['no', 'cancelar', 'cancel', 'nope', '👎'].includes(lower)

      if (yes) {
        const ticket = await createZohoTicket({
          ...session.pendingTicket,
          phone: from.replace('whatsapp:', ''),
        })
        const reply = `✅ Ticket creado exitosamente.\n📋 *Número:* ${ticket.ticketNumber ?? 'N/A'}\n\nUn asesor se pondrá en contacto contigo pronto. ¿Puedo ayudarte en algo más?`
        session.pendingTicket = undefined
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: reply })
        await saveSession(from, session)
        await sendWhatsApp(from, reply)
        return twimlOk()
      }

      if (no) {
        const reply = 'Entendido, no se creará el ticket. ¿Hay algo más en lo que pueda ayudarte?'
        session.pendingTicket = undefined
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: reply })
        await saveSession(from, session)
        await sendWhatsApp(from, reply)
        return twimlOk()
      }
      // Not a clear yes/no — fall through to normal processing
    }

    // ── Normal message flow ──────────────────────────────────────────────────
    session.messages.push({ role: 'user', content: body })

    const systemPrompt = await getMasterPrompt()
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const aiResponse = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [TICKET_TOOL],
      tool_choice: { type: 'auto' },
      messages: session.messages.slice(-MAX_HISTORY),
    })

    let replyText = ''
    let proposedTicket: PendingTicket | null = null

    for (const block of aiResponse.content) {
      if (block.type === 'text') {
        replyText += block.text
      } else if (block.type === 'tool_use' && block.name === 'propose_ticket') {
        proposedTicket = block.input as PendingTicket
      }
    }

    if (proposedTicket) {
      // Ask for confirmation via WhatsApp
      const confirmMsg =
        `📋 *Ticket de soporte*\n\n` +
        `*Asunto:* ${proposedTicket.subject}\n` +
        `*Descripción:* ${proposedTicket.description}\n\n` +
        `¿Confirmas la creación del ticket? Responde *SÍ* para confirmar o *NO* para cancelar.`

      session.pendingTicket = proposedTicket
      session.messages.push({ role: 'assistant', content: confirmMsg })
      await saveSession(from, session)
      await sendWhatsApp(from, confirmMsg)
    } else if (replyText) {
      session.messages.push({ role: 'assistant', content: replyText })
      await saveSession(from, session)
      const chunks = splitMessage(replyText)
      for (const chunk of chunks) {
        await sendWhatsApp(from, chunk)
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    await sendWhatsApp(from, 'Lo siento, ocurrió un error. Por favor intenta nuevamente.')
  }

  return twimlOk()
}
