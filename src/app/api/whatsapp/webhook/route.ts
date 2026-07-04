import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createZohoTicket } from '@/app/api/chat/route'
import { buildKnowledgeContext } from '@/lib/sofia-knowledge'
import crypto from 'crypto'

export const maxDuration = 60

// ── DB ───────────────────────────────────────────────────────────────────────
const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Sofia prompts ─────────────────────────────────────────────────────────────
const FALLBACK_PROMPT = `Eres Sofia, asistente virtual de Blackwell Global University (BGU).
Ayudas a estudiantes con consultas sobre programas académicos, matrículas, pagos, trámites y más.
Detecta automáticamente el idioma en que el usuario escribe y responde siempre en ese mismo idioma.
REGLAS SOBRE TICKETS:
- NUNCA propongas un ticket como cierre genérico.
- SOLO propón ticket cuando no puedas resolver la consulta.
- Antes de proponer, pregunta: "¿Te gustaría que cree un ticket de soporte? ¿Estás de acuerdo?"
- NUNCA crees el ticket sin confirmación explícita.
- Si el usuario dice que sí, usa la herramienta propose_ticket.`

const ONBOARDING_PROMPT = `Eres Sofia, asistente virtual de Blackwell Global University (BGU).
Estás iniciando una conversación por WhatsApp con una persona cuya identidad aún no conoces.

TU ÚNICA TAREA AHORA ES IDENTIFICAR AL USUARIO siguiendo estos pasos en orden:
1. Salúdalo cordialmente, preséntate como Sofia y explica que necesitas identificarlo para brindarte la mejor atención.
2. Pídele que se identifique con cualquiera de estos datos: nombre completo, correo institucional, teléfono registrado o número de documento/código de estudiante.
3. Pregúntale cuál es su relación con BGU: estudiante activo, aspirante/interesado, egresado, docente/colaborador, u otro.
4. Una vez que tengas suficiente información, usa la herramienta identify_user para registrar su identidad.

NO respondas ninguna otra consulta hasta completar la identificación.
Detecta el idioma del usuario y responde siempre en ese mismo idioma.`

async function getMasterPrompt(): Promise<string> {
  const { data } = await db()
    .from('ai_master_prompt')
    .select('prompt')
    .eq('id', 1)
    .single()
  return (data as { prompt?: string } | null)?.prompt ?? FALLBACK_PROMPT
}

// ── Tools ─────────────────────────────────────────────────────────────────────
const IDENTIFY_TOOL: Anthropic.Tool = {
  name: 'identify_user',
  description: 'Llama esta herramienta cuando hayas recopilado el nombre y el tipo de relación del usuario con BGU.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name:       { type: 'string', description: 'Nombre completo del usuario' },
      role:       { type: 'string', enum: ['estudiante', 'aspirante', 'egresado', 'docente', 'colaborador', 'otro'], description: 'Relación con BGU' },
      student_id: { type: 'string', description: 'Código de estudiante (solo si aplica)' },
    },
    required: ['name', 'role'],
  },
}

const TICKET_TOOL: Anthropic.Tool = {
  name: 'propose_ticket',
  description: 'Úsala SOLO cuando el usuario haya dado su acuerdo explícito para crear un ticket de soporte.',
  input_schema: {
    type: 'object' as const,
    properties: {
      subject:      { type: 'string', description: 'Asunto breve del ticket' },
      description:  { type: 'string', description: 'Descripción detallada del problema' },
      contactName:  { type: 'string', description: 'Nombre completo del usuario' },
      contactEmail: { type: 'string', description: 'Email del usuario' },
      phone:        { type: 'string', description: 'Teléfono del usuario' },
    },
    required: ['subject', 'description'],
  },
}

// ── Session ───────────────────────────────────────────────────────────────────
interface Message      { role: 'user' | 'assistant'; content: string }
interface PendingTicket { subject: string; description: string; contactName?: string; contactEmail?: string; phone?: string }
interface UserInfo      { name: string; role: string; student_id?: string }
interface Session {
  messages: Message[]
  pendingTicket?: PendingTicket
  identified: boolean
  userInfo?: UserInfo
}

const MAX_HISTORY = 20

async function getSession(phone: string): Promise<Session> {
  // Lee la fila más reciente (tolerante a duplicados si no hay constraint único)
  const { data } = await db()
    .from('whatsapp_sessions')
    .select('messages, pending_ticket, identified, user_info')
    .eq('phone', phone)
    .order('updated_at', { ascending: false })
    .limit(1)
  const row = (data?.[0] ?? null) as { messages?: Message[]; pending_ticket?: PendingTicket; identified?: boolean; user_info?: UserInfo } | null
  return {
    messages:      row?.messages ?? [],
    pendingTicket: row?.pending_ticket ?? undefined,
    identified:    row?.identified ?? false,
    userInfo:      row?.user_info ?? undefined,
  }
}

async function saveSession(phone: string, session: Session) {
  // Borra e inserta para garantizar UNA sola fila por teléfono, sin depender de
  // un constraint único (el upsert onConflict fallaba y creaba duplicados).
  const sb = db()
  await sb.from('whatsapp_sessions').delete().eq('phone', phone)
  const { error } = await sb.from('whatsapp_sessions').insert({
    phone,
    messages:      session.messages.slice(-MAX_HISTORY),
    pending_ticket: session.pendingTicket ?? null,
    identified:    session.identified,
    user_info:     session.userInfo ?? null,
    updated_at:    new Date().toISOString(),
  })
  if (error) console.error('saveSession error:', error.message)
}

// ── Twilio helpers ────────────────────────────────────────────────────────────
async function sendWhatsApp(to: string, body: string) {
  const sid   = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const from  = process.env.TWILIO_WHATSAPP_NUMBER!

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
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) }
  catch { return false }
}

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

const ROLE_LABELS: Record<string, string> = {
  estudiante:   'Estudiante activo',
  aspirante:    'Aspirante',
  egresado:     'Egresado',
  docente:      'Docente',
  colaborador:  'Colaborador',
  otro:         'Otro',
}

const twimlOk = () => new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } })

// ── Webhook ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((v, k) => { params[k] = v.toString() })

  const from       = params['From']
  const body       = params['Body']?.trim()
  const accountSid = params['AccountSid']

  if (!from || !body || accountSid !== process.env.TWILIO_ACCOUNT_SID) return twimlOk()

  if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req, params)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // ── Comando de reinicio (solo pruebas) ─────────────────────────────────────
  // Clave compleja para que nadie la escriba por error. Borra la sesión completa.
  const RESET_KEY = '#reiniciar-sofia-bgu-4917'
  if (body === RESET_KEY) {
    await db().from('whatsapp_sessions').delete().eq('phone', from)
    await sendWhatsApp(from, '🔄 Sesión reiniciada. Escríbeme de nuevo para empezar desde cero.')
    return twimlOk()
  }

  try {
    const session = await getSession(from)
    const lower   = body.toLowerCase().trim()

    // ── 0. Auto-identify by phone / email / código en academic_students ───────
    if (!session.identified) {
      // Buscar por teléfono (siempre) y por correo o documento si aparecen en el mensaje
      const phoneDigits = from.replace(/\D/g, '').slice(-9)
      const emailMatch = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]
      const codeMatch = body.match(/\b\d{5,}\b/)?.[0] // número de documento: 5+ dígitos

      const orConditions = [`phone_number.ilike.%${phoneDigits}%`]
      if (emailMatch) orConditions.push(`email.ilike.${emailMatch}`)
      if (codeMatch) orConditions.push(`document_number.ilike.%${codeMatch}%`)

      const { data: rows } = await db()
        .from('academic_students')
        .select('first_name, last_name, second_last_name, email, document_number')
        .or(orConditions.join(','))
        .eq('disabled', false)
        .limit(1)
      const student = rows?.[0]

      if (student) {
        const fullName = [student.first_name, student.last_name, student.second_last_name].filter(Boolean).join(' ')
        session.identified = true
        session.userInfo = { name: fullName, role: 'estudiante', student_id: student.document_number ?? undefined }
        const firstName = student.first_name ?? fullName.split(' ')[0]
        const welcome =
          `✅ *Estudiante identificado*\n👤 ${fullName}` +
          `\n\n¡Hola, ${firstName}! Soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?`
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: welcome })
        await saveSession(from, session)
        await sendWhatsApp(from, welcome)
        return twimlOk()
      }
    }

    // ── 1. Pending ticket confirmation ────────────────────────────────────────
    if (session.pendingTicket) {
      const yes = ['sí', 'si', 'yes', 'confirmo', 'confirmar', 'ok', '👍'].includes(lower)
      const no  = ['no', 'cancelar', 'cancel', 'nope', '👎'].includes(lower)

      if (yes) {
        const ticket = await createZohoTicket({
          ...session.pendingTicket,
          phone: from.replace('whatsapp:', ''),
        })
        const reply = `✅ Ticket creado.\n📋 *Número:* ${ticket.ticketNumber ?? 'N/A'}\n\nUn asesor te contactará pronto. ¿Puedo ayudarte en algo más?`
        session.pendingTicket = undefined
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: reply })
        await saveSession(from, session)
        await sendWhatsApp(from, reply)
        return twimlOk()
      }
      if (no) {
        const reply = 'Entendido, no se creará el ticket. ¿En qué más puedo ayudarte?'
        session.pendingTicket = undefined
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: reply })
        await saveSession(from, session)
        await sendWhatsApp(from, reply)
        return twimlOk()
      }
      // Not a clear yes/no → fall through
    }

    // ── 2. Add user message to history ────────────────────────────────────────
    session.messages.push({ role: 'user', content: body })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // ── 3. ONBOARDING: user not yet identified ────────────────────────────────
    if (!session.identified) {
      const aiResponse = await client.messages.create({
        model:        'claude-opus-4-8',
        max_tokens:   512,
        system:       ONBOARDING_PROMPT,
        tools:        [IDENTIFY_TOOL],
        tool_choice:  { type: 'auto' },
        messages:     session.messages.slice(-10),
      })

      let replyText    = ''
      let identifiedUser: UserInfo | null = null

      for (const block of aiResponse.content) {
        if (block.type === 'text') replyText += block.text
        else if (block.type === 'tool_use' && block.name === 'identify_user') {
          identifiedUser = block.input as UserInfo
        }
      }

      if (identifiedUser) {
        // Mark session as identified and send welcome
        session.identified = true
        session.userInfo   = identifiedUser
        const roleLabel    = ROLE_LABELS[identifiedUser.role] ?? identifiedUser.role
        const welcome =
          `✅ *Identidad confirmada*\n` +
          `👤 ${identifiedUser.name} · ${roleLabel}` +
          (identifiedUser.student_id ? ` · Cód: ${identifiedUser.student_id}` : '') +
          `\n\nPerfecto, ${identifiedUser.name.split(' ')[0]}. Ahora dime, ¿en qué puedo ayudarte?`
        session.messages.push({ role: 'assistant', content: welcome })
        await saveSession(from, session)
        await sendWhatsApp(from, welcome)
      } else if (replyText) {
        session.messages.push({ role: 'assistant', content: replyText })
        await saveSession(from, session)
        for (const chunk of splitMessage(replyText)) await sendWhatsApp(from, chunk)
      }

      return twimlOk()
    }

    // ── 4. NORMAL flow: identified user ──────────────────────────────────────
    const masterPrompt = await getMasterPrompt()

    // Inject user context so Sofia knows who she's talking to
    const userContext = session.userInfo
      ? `\n\nUSUARIO IDENTIFICADO:\n- Nombre: ${session.userInfo.name}\n- Tipo: ${ROLE_LABELS[session.userInfo.role] ?? session.userInfo.role}` +
        (session.userInfo.student_id ? `\n- Código: ${session.userInfo.student_id}` : '')
      : ''

    // Recuperar conocimiento relevante a la última pregunta (RAG)
    const knowledgeContext = await buildKnowledgeContext(body)

    const aiResponse = await client.messages.create({
      model:       'claude-opus-4-8',
      max_tokens:  1024,
      system:      [masterPrompt + userContext, knowledgeContext].filter(Boolean).join('\n\n'),
      tools:       [TICKET_TOOL],
      tool_choice: { type: 'auto' },
      messages:    session.messages.slice(-MAX_HISTORY),
    })

    let replyText    = ''
    let proposedTicket: PendingTicket | null = null

    for (const block of aiResponse.content) {
      if (block.type === 'text') replyText += block.text
      else if (block.type === 'tool_use' && block.name === 'propose_ticket') {
        proposedTicket = block.input as PendingTicket
      }
    }

    if (proposedTicket) {
      const confirmMsg =
        `📋 *Ticket de soporte*\n\n` +
        `*Asunto:* ${proposedTicket.subject}\n` +
        `*Descripción:* ${proposedTicket.description}\n\n` +
        `¿Confirmas la creación del ticket? Responde *SÍ* o *NO*.`
      session.pendingTicket = { ...proposedTicket, contactName: proposedTicket.contactName ?? session.userInfo?.name }
      session.messages.push({ role: 'assistant', content: confirmMsg })
      await saveSession(from, session)
      await sendWhatsApp(from, confirmMsg)
    } else if (replyText) {
      session.messages.push({ role: 'assistant', content: replyText })
      await saveSession(from, session)
      for (const chunk of splitMessage(replyText)) await sendWhatsApp(from, chunk)
    }

  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    await sendWhatsApp(from, 'Lo siento, ocurrió un error. Por favor intenta nuevamente.')
  }

  return twimlOk()
}
