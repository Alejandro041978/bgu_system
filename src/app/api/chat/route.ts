import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildKnowledgeContext } from '@/lib/sofia-knowledge'
import { parseOutcome, stripOutcome, recordOutcome } from '@/lib/retention-outcome'
import { getBot } from '@/lib/bots'
import { extractAndSaveLead } from '@/lib/sales-leads'

export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getZohoToken(): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
  const resp = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const json = await resp.json() as { access_token?: string }
  return json.access_token ?? ''
}

async function findOrCreateContact(token: string, params: {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
}): Promise<string> {
  const orgId = process.env.ZOHO_ORGANIZATION_ID!
  const headers = {
    'Authorization': `Zoho-oauthtoken ${token}`,
    'orgId': orgId,
    'Content-Type': 'application/json',
  }

  // Intentar buscar por email primero
  if (params.email) {
    try {
      const searchResp = await fetch(
        `https://desk.zoho.com/api/v1/contacts/search?email=${encodeURIComponent(params.email)}`,
        { headers }
      )
      if (searchResp.ok) {
        const searchData = await searchResp.json() as { count: number; data: { id: string }[] }
        if (searchData.count > 0) return searchData.data[0].id
      }
    } catch { /* si falla la búsqueda, continuar a crear */ }
  }

  // Crear nuevo contacto
  const contactBody: Record<string, string> = {
    lastName: params.lastName ?? params.firstName ?? 'Estudiante BGU',
  }
  if (params.firstName) contactBody.firstName = params.firstName
  if (params.email) contactBody.email = params.email
  if (params.phone) contactBody.phone = params.phone

  const createResp = await fetch('https://desk.zoho.com/api/v1/contacts', {
    method: 'POST',
    headers,
    body: JSON.stringify(contactBody),
  })
  const contact = await createResp.json() as { id: string }
  return contact.id
}

export async function createZohoTicket(params: {
  subject: string
  description: string
  contactName?: string
  contactEmail?: string
  phone?: string
}) {
  const token = await getZohoToken()
  const orgId = process.env.ZOHO_ORGANIZATION_ID!

  // Separar nombre en firstName / lastName
  const nameParts = (params.contactName ?? '').trim().split(' ')
  const firstName = nameParts.slice(0, -1).join(' ') || undefined
  const lastName = nameParts[nameParts.length - 1] || 'Estudiante'

  const contactId = await findOrCreateContact(token, {
    email: params.contactEmail,
    phone: params.phone,
    firstName,
    lastName,
  })

  const resp = await fetch('https://desk.zoho.com/api/v1/tickets', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'orgId': orgId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: params.subject,
      description: params.description,
      departmentId: '1095985000000006907',
      channel: 'Chat',
      contactId,
    }),
  })
  const result = await resp.json() as { id?: string; ticketNumber?: string }
  return result
}

// Herramienta que Claude usa para PROPONER un ticket (no crearlo — la confirmación la da el usuario en el frontend)
const TICKET_TOOL: Anthropic.Tool = {
  name: 'propose_ticket',
  description: 'Úsala SOLO cuando el estudiante haya dado su acuerdo explícito para crear un ticket de soporte. Recopila previamente el asunto y descripción del problema en la conversación.',
  input_schema: {
    type: 'object' as const,
    properties: {
      subject: { type: 'string', description: 'Asunto breve del ticket (máx 100 caracteres)' },
      description: { type: 'string', description: 'Descripción detallada del problema del estudiante' },
      contactName: { type: 'string', description: 'Nombre completo del estudiante' },
      contactEmail: { type: 'string', description: 'Correo electrónico del estudiante (obligatorio si no hay teléfono)' },
      phone: { type: 'string', description: 'Teléfono del estudiante (obligatorio si no hay email)' },
    },
    required: ['subject', 'description'],
  },
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
      contactEmail?: string
      studentContext?: string
      studentId?: string        // requerido por Camila para registrar el resultado
      sessionId?: string
      source?: string
      bot?: string
      confirmTicket?: { subject: string; description: string; contactName?: string }
    }

    const { messages, contactEmail, studentContext, studentId, sessionId, source, confirmTicket } = body
    const botKey = body.bot ?? 'sofia'

    // Si el usuario confirmó la creación del ticket, crearlo directamente
    if (confirmTicket) {
      try {
        const ticket = await createZohoTicket({
          ...confirmTicket,
          contactEmail,
        })
        return NextResponse.json({ ticketCreated: true, ticketNumber: ticket.ticketNumber }, { headers: CORS_HEADERS })
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS })
      }
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    const bot = await getBot(botKey)
    const masterPrompt = bot?.prompt?.trim() ? bot.prompt : 'Eres un asistente virtual de Blackwell Global University (BGU). Responde en el idioma del usuario y sé honesto: si no sabes un dato, dilo.'
    const isSales = bot?.role === 'ventas'
    // Camila (retención) cierra cada respuesta con un código [[R: ...]] que el
    // estudiante NO debe ver, y no propone tickets: cuando alguien anuncia su
    // retiro, abre un expediente para la llamada humana.
    const isRetention = bot?.role === 'retencion'

    // Recuperar conocimiento relevante a la última pregunta del usuario (RAG)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const knowledgeContext = await buildKnowledgeContext(lastUserMsg, botKey)

    const systemPrompt = [masterPrompt, studentContext, knowledgeContext]
      .filter(Boolean)
      .join('\n\n')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = client.messages.stream({
            model: 'claude-opus-4-8',
            max_tokens: 1024,
            system: systemPrompt,
            // Sofia (soporte) puede proponer tickets; ventas y retención no.
            ...(isSales || isRetention ? {} : { tools: [TICKET_TOOL], tool_choice: { type: 'auto' as const } }),
            messages: messages.map(m => ({ role: m.role, content: m.content })),
          })

          let toolUseBlock: { id: string; name: string; input: Record<string, unknown> } | null = null
          let assistantText = ''

          // El streaming emite token a token, así que el código [[R: ...]] de
          // Camila se le mostraría al estudiante antes de poder quitarlo. Para
          // ella retenemos todo lo que pueda ser el inicio de un marcador y sólo
          // soltamos lo que ya es seguro enviar.
          let held = ''
          const send = (text: string) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          const emit = (text: string) => {
            if (!isRetention) { send(text); return }
            held += text
            const i = held.indexOf('[[')
            if (i !== -1) { if (i > 0) send(held.slice(0, i)); held = held.slice(i); return }
            // un "[" final podría ser el arranque de "[[": se retiene
            const tail = held.endsWith('[') ? 1 : 0
            const safe = held.slice(0, held.length - tail)
            if (safe) send(safe)
            held = held.slice(held.length - tail)
          }

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
              toolUseBlock = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                assistantText += event.delta.text
                emit(event.delta.text)
              } else if (event.delta.type === 'input_json_delta' && toolUseBlock) {
                // Acumulamos el JSON del tool input (llega en chunks)
                try {
                  const partial = JSON.parse(
                    JSON.stringify(event.delta.partial_json ?? '')
                  )
                  Object.assign(toolUseBlock.input, partial)
                } catch { /* acumulación parcial */ }
              }
            } else if (event.type === 'message_stop' && toolUseBlock?.name === 'propose_ticket') {
              // Claude quiere proponer un ticket — enviamos la propuesta al frontend para confirmación
              const finalMessage = await anthropicStream.finalMessage()
              const toolBlock = finalMessage.content.find(b => b.type === 'tool_use') as
                { type: 'tool_use'; input: { subject: string; description: string; contactName?: string; contactEmail?: string; phone?: string } } | undefined
              if (toolBlock) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  action: 'confirm_ticket',
                  subject: toolBlock.input.subject,
                  description: toolBlock.input.description,
                  contactName: toolBlock.input.contactName,
                  contactEmail: toolBlock.input.contactEmail,
                  phone: toolBlock.input.phone,
                })}\n\n`))
              }
            }
          }

          // Soltar lo retenido, ya sin el código de clasificación.
          if (isRetention && held) {
            const resto = stripOutcome(held)
            if (resto) send(resto)
            held = ''
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))

          // Camila: registrar la clasificación del diálogo. Si anunció retiro,
          // recordOutcome abre el expediente para la llamada humana.
          if (isRetention && studentId) {
            const outcome = parseOutcome(assistantText)
            if (outcome) {
              recordOutcome(supabaseAdmin, studentId, outcome)
                .catch(e => console.error('recordOutcome', e))
            }
          }

          // Persist conversation for daily supervisor analysis
          if (sessionId && messages.length > 0) {
            const allMessages = [
              ...messages,
              // se guarda sin el código: no es parte de la conversación
              { role: 'assistant' as const, content: isRetention ? stripOutcome(assistantText) : assistantText },
            ].filter(m => m.content)
            supabaseAdmin.from('sofia_conversations').upsert({
              session_id: sessionId,
              messages: allMessages,
              message_count: allMessages.length,
              contact_email: contactEmail ?? null,
              source: source ?? 'web',
              bot_key: botKey,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'session_id' }).then(() => {/* fire-and-forget */})

            // Bots de ventas: extraer y registrar el prospecto en segundo plano
            if (isSales) {
              extractAndSaveLead(allMessages, botKey, `web:${sessionId}`, { email: contactEmail })
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new NextResponse(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS })
  }
}
