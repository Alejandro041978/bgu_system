import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createZohoTicket } from '@/app/api/chat/route'
import { buildKnowledgeContext } from '@/lib/sofia-knowledge'
import { buildRetentionContext } from '@/lib/retention-context'
import { splitReply, recordOutcome } from '@/lib/retention-outcome'
import { getBotByTwilioNumber, getBot, type Bot } from '@/lib/bots'
import { extractAndSaveLead } from '@/lib/sales-leads'
import { autoAssign } from '@/lib/inbox-assign'
import { recordInboxConversation } from '@/lib/inbox-record'
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

const REQUEST_HUMAN_TOOL: Anthropic.Tool = {
  name: 'request_human',
  description: 'Deriva al usuario con un asesor humano. Úsala cuando el usuario pida hablar con una persona/asesor. MUY IMPORTANTE: NO la uses en el primer mensaje ni sin contexto. Antes de derivar, PREGUNTA al usuario cuál es su tema o consulta si aún no lo ha explicado, para poder generar un resumen útil. Solo cuando ya entiendas claramente qué necesita, llama a esta herramienta. NO la uses si simplemente no puedes resolver algo — para eso propón un ticket con propose_ticket.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary:  { type: 'string', description: 'Resumen ejecutivo (2-3 frases) del tema/problema REAL del usuario, basado en lo que te contó. Específico y accionable para el asesor. No pongas "quiere hablar con un humano" — pon el motivo real.' },
      language: { type: 'string', enum: ['es', 'en', 'pt', 'other'], description: 'Idioma en que conversa el usuario (es=español, en=inglés, pt=portugués).' },
      topic:    { type: 'string', enum: ['pagos', 'notas', 'admision', 'asistencia', 'tramites', 'tecnico', 'otro'], description: 'Tema principal: pagos=cobros/matrícula/Flywire; notas=calificaciones; admision=inscripción/requisitos; asistencia=consulta general; tramites=documentos/certificados; tecnico=acceso/plataforma; otro=si no encaja.' },
    },
    required: ['summary', 'language', 'topic'],
  },
}

const HANDOFF_INSTRUCTION = `\n\nDERIVACIÓN A UN ASESOR HUMANO: Si el usuario pide hablar con una persona/asesor, NO lo derives de inmediato. Primero pregúntale de forma amable cuál es su tema o consulta (si aún no lo ha explicado). Solo cuando tengas claro el motivo real, usa la herramienta request_human con un resumen útil para el asesor. Nunca derives sin haber entendido qué necesita.`

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

async function getSession(phone: string, botKey: string): Promise<Session> {
  // Lee la fila más reciente (tolerante a duplicados si no hay constraint único)
  const { data } = await db()
    .from('whatsapp_sessions')
    .select('messages, pending_ticket, identified, user_info')
    .eq('phone', phone)
    .eq('bot_key', botKey)
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

async function saveSession(phone: string, botKey: string, session: Session) {
  // Borra e inserta para garantizar UNA sola fila por (teléfono, bot).
  const sb = db()
  await sb.from('whatsapp_sessions').delete().eq('phone', phone).eq('bot_key', botKey)
  const { error } = await sb.from('whatsapp_sessions').insert({
    phone,
    bot_key:       botKey,
    messages:      session.messages.slice(-MAX_HISTORY),
    pending_ticket: session.pendingTicket ?? null,
    identified:    session.identified,
    user_info:     session.userInfo ?? null,
    updated_at:    new Date().toISOString(),
  })
  if (error) console.error('saveSession error:', error.message)

  // Registra la conversación para el supervisor diario (todos los bots de WhatsApp).
  const { error: convErr } = await sb.from('sofia_conversations').upsert({
    session_id:    `wa:${botKey}:${phone}`,
    messages:      session.messages,
    message_count: session.messages.length,
    contact_email: null,
    source:        'whatsapp',
    bot_key:       botKey,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'session_id' })
  if (convErr) console.error('sofia_conversations upsert error:', convErr.message)
}

// ── Twilio helpers ────────────────────────────────────────────────────────────
interface TwilioCreds { from?: string; sid?: string; token?: string }

async function sendWhatsApp(to: string, body: string, creds?: TwilioCreds) {
  const sid   = creds?.sid ?? process.env.TWILIO_ACCOUNT_SID!
  const token = creds?.token ?? process.env.TWILIO_AUTH_TOKEN!
  const from  = creds?.from ?? process.env.TWILIO_WHATSAPP_NUMBER!

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  })
}

function validateTwilioSignature(req: NextRequest, params: Record<string, string>, authToken: string): boolean {
  const signature = req.headers.get('x-twilio-signature') ?? ''
  if (!signature) return false
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`
  const payload = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url)
  const expected = crypto.createHmac('sha1', authToken).update(payload).digest('base64')
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) }
  catch { return false }
}

// Detección ligera de idioma para los mensajes fijos (saludo, acuse).
function detectLang(t: string): 'en' | 'es' {
  const s = t.toLowerCase()
  const es = /[áéíóúñ¿¡]|\b(hola|buenos|buenas|gracias|necesito|quiero|ayuda|por favor|pago|humano|asesor|matr[ií]cula)\b/
  const en = /\b(hello|hi|hey|good|morning|afternoon|evening|please|thanks|thank you|i need|i want|help|payment|human|agent)\b/
  if (es.test(s)) return 'es'
  if (en.test(s)) return 'en'
  return 'es'
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

// ── Crea un código de enlace (handoff) y devuelve el link wa.me al número humano ─
async function createHandoff(customerPhone: string, botKey: string, summary: string, language: string, topic: string, userInfo?: UserInfo) {
  const code = 'ENLACE-' + Math.floor(1000 + Math.random() * 9000)
  await db().from('handoff_codes').insert({
    code, customer_phone: customerPhone, bot_key: botKey, summary, language, topic,
    student_name: userInfo?.name ?? null, document_number: userInfo?.student_id ?? null,
  })
  const inbox = await getBot('servicio')
  const humanDigits = (inbox?.twilio_number ?? '').replace(/\D/g, '')
  const link = humanDigits ? `https://wa.me/${humanDigits}?text=${encodeURIComponent(code)}` : null
  return { code, link }
}

// ── Buzón compartido (puerta dura): solo abre/continúa con código válido ────────
async function receiveInboxMessage(from: string, body: string, inboxKey: string, creds: TwilioCreds) {
  const sb = db()
  const now = new Date().toISOString()

  // ¿El mensaje trae un código de enlace válido? (se consume aunque ya exista conversación)
  const codeMatch = body.match(/ENLACE-\d{4}/i)?.[0]?.toUpperCase()
  const { data: handoff } = codeMatch
    ? await sb.from('handoff_codes').select('*').eq('code', codeMatch).eq('used', false).gt('expires_at', now).maybeSingle()
    : { data: null }

  // Conversación existente para este teléfono (cualquier estado; hay índice único por teléfono)
  const { data: existingConv } = await sb.from('wa_conversations')
    .select('id, unread_count, status').eq('inbox_key', inboxKey).eq('customer_phone', from).maybeSingle()

  // 1) Código válido → adjunta el contexto de Sofia (reabre o crea) + acuse automático
  if (handoff) {
    await sb.from('handoff_codes').update({ used: true, used_at: now }).eq('code', handoff.code)
    // Auto-asignación por especialidad (null = cola para la supervisora)
    const assigned = await autoAssign(handoff.language, handoff.topic ?? null)
    const patch = {
      status: 'open', assigned_to: assigned?.user_id ?? null, assigned_name: assigned?.name ?? null,
      customer_name: handoff.student_name ?? undefined,
      summary: handoff.summary, language: handoff.language, topic: handoff.topic ?? null,
      unread_count: 1, first_customer_at: now, last_message_at: now, last_message_preview: 'Derivado por Sofía', updated_at: now,
    }
    if (existingConv) {
      await sb.from('wa_conversations').update(patch).eq('id', existingConv.id)
    } else {
      await sb.from('wa_conversations').insert({ inbox_key: inboxKey, customer_phone: from, ...patch })
    }
    const ack = handoff.language === 'en'
      ? 'Thank you 🙌 A Student Services advisor will contact you shortly.'
      : 'Gracias 🙌 En breve un asesor de Servicio al Estudiante se comunicará contigo.'
    await sendWhatsApp(from, ack, creds)
    return
  }

  // 2) Ya hay conversación abierta → diálogo en curso, agrega el mensaje
  if (existingConv && existingConv.status === 'open') {
    await sb.from('wa_conversations').update({
      unread_count: (existingConv.unread_count ?? 0) + 1, last_message_at: now, last_message_preview: body.slice(0, 120), updated_at: now,
    }).eq('id', existingConv.id)
    await sb.from('wa_messages').insert({ conversation_id: existingConv.id, direction: 'in', body })
    await recordInboxConversation(existingConv.id)
    return
  }

  // 3) Sin código y sin conversación → puerta dura (deriva a Sofia, no crea conversación)
  const sofiaDigits = (process.env.TWILIO_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')
  const isEn = detectLang(body) === 'en'
  const gate = isEn
    ? (sofiaDigits
        ? `To help you faster, please first chat with *Sofia*, our assistant 🤖: https://wa.me/${sofiaDigits}\n\nIf Sofia can't resolve your case, she'll give you a link to talk to an advisor.`
        : `To start a chat you need a link code. Please contact *Sofia*, our virtual assistant, first.`)
    : (sofiaDigits
        ? `Para atenderte mejor y más rápido, primero conversa con *Sofía*, nuestra asistente 🤖: https://wa.me/${sofiaDigits}\n\nSi Sofía no resuelve tu caso, te dará un enlace para hablar con un asesor.`
        : `Para iniciar el diálogo necesitas un código de enlace. Primero comunícate con *Sofía*, nuestra asistente virtual.`)
  await sendWhatsApp(from, gate, creds)
}

// ── Flujo de retención (Camila) ────────────────────────────────────────────────
// Tiene su propio camino porque el de Sofía haría todo mal con ella: la mandaría
// a "identifícate, soy Sofia" (a alguien a quien NOSOTROS le escribimos primero,
// por su nombre), buscaría en la base de Sofía en vez de la suya, le mostraría el
// código [[R: ...]] al estudiante y no clasificaría nada.
//
// Camila SÍ puede derivar a un humano (request_human): si no sabe algo, el
// estudiante no puede quedar en el aire justo cuando estaba por irse.
// No propone tickets de Zoho: eso es trabajo de Sofía.

// Nos escriben desde el teléfono al que les escribimos: la identificación es el
// número, no un interrogatorio.
//
// El formato guardado varía muchísimo (con/sin código de país, 8 a 13 dígitos),
// así que hay que comparar por la cola. PERO hay estudiantes distintos que
// comparten los últimos 8 dígitos: devolver "el primero que aparezca" haría que
// Camila le hablara a Karen con la deuda de Diego. Eso es una fuga de datos
// personales, no una imprecisión.
//
// Por eso: sólo se identifica cuando la coincidencia es ÚNICA. Ante cualquier
// duda se devuelve null y Camila responde sin contexto — degradada, pero sin
// mostrarle a nadie los datos de otro.
async function findStudentByPhone(phone: string): Promise<{ id: string; first_name: string | null } | null> {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return null
  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, phone_number').not('phone_number', 'is', null).range(f, f + 999)
    const r = data ?? []
    all = all.concat(r)
    if (r.length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const norm = (s: any) => String(s.phone_number).replace(/\D/g, '')

  // 1) Coincidencia exacta de todos los dígitos: la más confiable.
  const exactos = all.filter(s => norm(s) === digits)
  if (exactos.length === 1) return exactos[0]
  if (exactos.length > 1) return null   // duplicado real: no adivinar

  // 2) Por los últimos 8 dígitos, sólo si es inequívoca.
  const tail = digits.slice(-8)
  const cola = all.filter(s => norm(s).length >= 8 && norm(s).endsWith(tail))
  return cola.length === 1 ? cola[0] : null
}

async function runRetentionFlow(from: string, body: string, bot: Bot) {
  const creds: TwilioCreds = {
    from:  bot.twilio_number ?? undefined,
    sid:   bot.twilio_account_sid ?? undefined,
    token: bot.twilio_auth_token ?? undefined,
  }
  const sb = db()
  try {
    const session = await getSession(from, bot.key)
    session.messages.push({ role: 'user', content: body })

    const phone = from.replace('whatsapp:', '')
    const student = await findStudentByPhone(phone)

    // Contexto real: días de ausencia, saldo, evaluaciones pendientes, nivel.
    // Sin esto Camila habla al vacío y no puede desarmar ninguna traba.
    const ctx = student ? await buildRetentionContext(sb, student.id) : null

    const knowledgeContext = await buildKnowledgeContext(body, bot.key)
    const systemPrompt = [bot.prompt, ctx?.text, knowledgeContext].filter(Boolean).join('\n\n')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const aiResponse = await client.messages.create({
      model:       'claude-opus-4-8',
      max_tokens:  1024,
      system:      systemPrompt,
      tools:       [REQUEST_HUMAN_TOOL],
      tool_choice: { type: 'auto' },
      messages:    session.messages.slice(-MAX_HISTORY),
    })

    let rawText = ''
    let humanRequest: { summary: string; language: string; topic: string } | null = null
    for (const block of aiResponse.content) {
      if (block.type === 'text') rawText += block.text
      else if (block.type === 'tool_use' && block.name === 'request_human') {
        humanRequest = block.input as { summary: string; language: string; topic: string }
      }
    }

    // El código de clasificación JAMÁS puede llegarle al estudiante.
    const { reply: cleanReply, outcome } = splitReply(rawText)

    if (humanRequest) {
      const { link } = await createHandoff(from, bot.key, humanRequest.summary, humanRequest.language, humanRequest.topic ?? 'otro',
        student ? { name: student.first_name ?? 'Estudiante', role: 'estudiante' } : undefined)
      const msg = link
        ? `${cleanReply ? cleanReply + '\n\n' : ''}Te conecto con un asesor 👤\n\nToca aquí para continuar:\n${link}`
        : (cleanReply || 'Déjame consultarlo con un asesor y te escribo.')
      session.messages.push({ role: 'assistant', content: msg })
      await saveSession(from, bot.key, session)
      for (const chunk of splitMessage(msg)) await sendWhatsApp(from, chunk, creds)
    } else {
      const reply = cleanReply || 'Disculpa, ¿me repites eso?'
      session.messages.push({ role: 'assistant', content: reply })
      await saveSession(from, bot.key, session)
      for (const chunk of splitMessage(reply)) await sendWhatsApp(from, chunk, creds)
    }

    // Clasificar: es el verdadero producto de Camila. Guarda el compromiso con
    // su fecha, la traba detectada, y si anuncia retiro abre el expediente para
    // la llamada humana.
    if (student && outcome) {
      await recordOutcome(sb, student.id, outcome).catch(e => console.error('recordOutcome', e))
    }
  } catch (err) {
    console.error('runRetentionFlow error:', err)
    await sendWhatsApp(from, 'Disculpa, tuve un inconveniente. ¿Puedes escribirme de nuevo?', creds)
  }
}

// ── Flujo de ventas (Antonella) ────────────────────────────────────────────────
// Sin identificación de estudiante: conversa, vende y registra el prospecto en
// sales_leads en segundo plano (el embudo lo maneja el extractor de leads).
async function runSalesFlow(from: string, body: string, bot: Bot) {
  const creds: TwilioCreds = {
    from:  bot.twilio_number ?? undefined,
    sid:   bot.twilio_account_sid ?? undefined,
    token: bot.twilio_auth_token ?? undefined,
  }
  try {
    const session = await getSession(from, bot.key)
    session.messages.push({ role: 'user', content: body })

    const knowledgeContext = await buildKnowledgeContext(body, bot.key)
    const systemPrompt = [bot.prompt, knowledgeContext].filter(Boolean).join('\n\n')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const aiResponse = await client.messages.create({
      model:      'claude-opus-4-8',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   session.messages.slice(-MAX_HISTORY),
    })

    const reply = aiResponse.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
      || 'Disculpa, ¿me repites tu consulta?'

    session.messages.push({ role: 'assistant', content: reply })
    await saveSession(from, bot.key, session)
    for (const chunk of splitMessage(reply)) await sendWhatsApp(from, chunk, creds)

    const phone = from.replace('whatsapp:', '')

    // La conversación ya quedó registrada en sofia_conversations por saveSession.
    // Registrar/actualizar el prospecto en segundo plano
    extractAndSaveLead(session.messages, bot.key, phone, { phone })
  } catch (err) {
    console.error('runSalesFlow error:', err)
    await sendWhatsApp(from, 'Disculpa, tuve un inconveniente. ¿Puedes escribirme de nuevo?', creds)
  }
}

// ── Webhook ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((v, k) => { params[k] = v.toString() })

  const from       = params['From']
  const to         = params['To'] ?? ''
  const body       = params['Body']?.trim()
  const accountSid = params['AccountSid']

  if (!from || !body) return twimlOk()

  // ── Enrutamiento por número de destino: ¿qué bot recibió el mensaje? ────────
  const routedBot = await getBotByTwilioNumber(to)
  const botKey = routedBot?.key ?? 'sofia'

  // Credenciales de la cuenta Twilio de este bot (fallback a env = cuenta de Sofia)
  const acctSid   = routedBot?.twilio_account_sid ?? process.env.TWILIO_ACCOUNT_SID
  const authToken = routedBot?.twilio_auth_token ?? process.env.TWILIO_AUTH_TOKEN!
  const botCreds: TwilioCreds = {
    from:  routedBot?.twilio_number ?? undefined,
    sid:   routedBot?.twilio_account_sid ?? undefined,
    token: routedBot?.twilio_auth_token ?? undefined,
  }

  // Validar que el mensaje venga de la cuenta esperada y con firma válida
  if (accountSid !== acctSid) return twimlOk()
  if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req, params, authToken)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // ── Comando de reinicio (solo pruebas) ─────────────────────────────────────
  const RESET_KEY = '#reiniciar-sofia-bgu-4917'
  if (body === RESET_KEY) {
    await db().from('whatsapp_sessions').delete().eq('phone', from).eq('bot_key', botKey)
    await sendWhatsApp(from, '🔄 Sesión reiniciada. Escríbeme de nuevo para empezar desde cero.', botCreds)
    return twimlOk()
  }

  // ── Bots de ventas (Antonella): flujo comercial con embudo ─────────────────
  if (routedBot && routedBot.role === 'ventas') {
    await runSalesFlow(from, body, routedBot)
    return twimlOk()
  }

  // ── Retención (Camila): flujo propio ───────────────────────────────────────
  // Sin esto caía en el de Sofía, que le pediría identificarse a alguien a quien
  // nosotros le escribimos primero por su nombre.
  if (routedBot && routedBot.role === 'retencion') {
    await runRetentionFlow(from, body, routedBot)
    return twimlOk()
  }

  // ── Buzón compartido (equipo humano): puerta dura + código de enlace ─────────
  if (routedBot && routedBot.role === 'inbox') {
    await receiveInboxMessage(from, body, routedBot.key, botCreds)
    return twimlOk()
  }

  try {
    const session = await getSession(from, botKey)
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
        const isEn = detectLang(body) === 'en'
        const welcome = isEn
          ? `✅ *Student identified*\n👤 ${fullName}\n\nHi, ${firstName}! I'm Sofia, BGU's virtual assistant. How can I help you today?`
          : `✅ *Estudiante identificado*\n👤 ${fullName}\n\n¡Hola, ${firstName}! Soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?`
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: welcome })
        await saveSession(from, botKey, session)
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
        await saveSession(from, botKey, session)
        await sendWhatsApp(from, reply)
        return twimlOk()
      }
      if (no) {
        const reply = 'Entendido, no se creará el ticket. ¿En qué más puedo ayudarte?'
        session.pendingTicket = undefined
        session.messages.push({ role: 'user', content: body }, { role: 'assistant', content: reply })
        await saveSession(from, botKey, session)
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
        await saveSession(from, botKey, session)
        await sendWhatsApp(from, welcome)
      } else if (replyText) {
        session.messages.push({ role: 'assistant', content: replyText })
        await saveSession(from, botKey, session)
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
      system:      [masterPrompt + userContext + HANDOFF_INSTRUCTION, knowledgeContext].filter(Boolean).join('\n\n'),
      tools:       [TICKET_TOOL, REQUEST_HUMAN_TOOL],
      tool_choice: { type: 'auto' },
      messages:    session.messages.slice(-MAX_HISTORY),
    })

    let replyText    = ''
    let proposedTicket: PendingTicket | null = null
    let humanRequest: { summary: string; language: string; topic: string } | null = null

    for (const block of aiResponse.content) {
      if (block.type === 'text') replyText += block.text
      else if (block.type === 'tool_use' && block.name === 'propose_ticket') {
        proposedTicket = block.input as PendingTicket
      } else if (block.type === 'tool_use' && block.name === 'request_human') {
        humanRequest = block.input as { summary: string; language: string; topic: string }
      }
    }

    if (humanRequest) {
      const { link } = await createHandoff(from, botKey, humanRequest.summary, humanRequest.language, humanRequest.topic ?? 'otro', session.userInfo)
      const msg = link
        ? `Con gusto te conecto con un asesor 👤\n\nToca aquí para continuar:\n${link}\n\nLe paso tu caso para que te atienda de una vez.`
        : 'En este momento no puedo conectarte con un asesor. ¿Deseas que cree un ticket de soporte?'
      session.messages.push({ role: 'assistant', content: msg })
      await saveSession(from, botKey, session)
      await sendWhatsApp(from, msg)
    } else if (proposedTicket) {
      const confirmMsg =
        `📋 *Ticket de soporte*\n\n` +
        `*Asunto:* ${proposedTicket.subject}\n` +
        `*Descripción:* ${proposedTicket.description}\n\n` +
        `¿Confirmas la creación del ticket? Responde *SÍ* o *NO*.`
      session.pendingTicket = { ...proposedTicket, contactName: proposedTicket.contactName ?? session.userInfo?.name }
      session.messages.push({ role: 'assistant', content: confirmMsg })
      await saveSession(from, botKey, session)
      await sendWhatsApp(from, confirmMsg)
    } else if (replyText) {
      session.messages.push({ role: 'assistant', content: replyText })
      await saveSession(from, botKey, session)
      for (const chunk of splitMessage(replyText)) await sendWhatsApp(from, chunk)
    }

  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    await sendWhatsApp(from, 'Lo siento, ocurrió un error. Por favor intenta nuevamente.')
  }

  return twimlOk()
}
