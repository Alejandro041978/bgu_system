import { createClient } from '@supabase/supabase-js'
import { autoAssign } from './inbox-assign'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Ticket en el buzón del ERP (antes iban a Zoho Desk, que ya no se usa).
//
// El buzón es multicanal: ya recibe correos y chats. El ticket es un canal más
// (channel='ticket'). Tenerlo aquí y no en un sistema externo es lo que hace
// que funcione todo lo que se construyó alrededor: número de caso, SLA de
// primera respuesta y cierre, auto-asignación por idioma/tema y el supervisor
// diario. Un ticket en Zoho era invisible para todo eso.
//
// OJO — ticket y escalar a humano son cosas distintas:
//   escalar (request_human) → el estudiante PIDE hablar con alguien; se le manda
//     el código y él se mueve al número del buzón. La conversación sigue viva.
//   ticket (esto)           → el bot NO PUDO responder algo; se registra el caso
//     y alguien lo atiende después. El estudiante no hace nada.
// ---------------------------------------------------------------------------
export interface TicketInput {
  subject: string
  description: string
  contactName?: string
  contactEmail?: string
  phone?: string
  language?: string
  topic?: string
  botKey?: string          // quién lo generó (sofia, retencion…)
}

export async function createInboxTicket(t: TicketInput): Promise<{ caseNumber: number | null; conversationId: string }> {
  const sb = db()
  const now = new Date().toISOString()
  const phone = t.phone ? (t.phone.startsWith('whatsapp:') ? t.phone : `whatsapp:${t.phone}`) : null
  const language = t.language ?? 'es'
  const topic = t.topic ?? 'otro'

  // Se asigna igual que un chat: por idioma y especialidad. Un ticket sin dueño
  // es un ticket que nadie mira.
  const assigned = await autoAssign(language, topic)

  const base = {
    inbox_key: 'servicio',
    channel: 'ticket',
    status: 'open',
    assigned_to: assigned?.user_id ?? null,
    assigned_name: assigned?.name ?? null,
    customer_name: t.contactName ?? null,
    customer_email: t.contactEmail ?? null,
    subject: t.subject,
    summary: t.description.slice(0, 500),
    language, topic,
    unread_count: 1,
    // first_customer_at arranca el reloj del SLA: el estudiante ya planteó su
    // problema, aunque lo haya hecho a través del bot.
    first_customer_at: now,
    last_message_at: now,
    last_message_preview: t.subject,
    updated_at: now,
  }

  // Si ya tiene una conversación por teléfono, se agrega ahí en vez de abrir
  // otra: el buzón tiene índice único por teléfono, y además partir el
  // historial de un estudiante en dos hilos es justo lo que evita el buzón.
  let convId: string | null = null
  if (phone) {
    const { data: existing } = await sb.from('wa_conversations')
      .select('id').eq('inbox_key', 'servicio').eq('customer_phone', phone).maybeSingle()
    if (existing) {
      await sb.from('wa_conversations').update({
        status: 'open', subject: t.subject, summary: base.summary, topic, language,
        unread_count: 1, last_message_at: now, last_message_preview: t.subject, updated_at: now,
      }).eq('id', existing.id)
      convId = existing.id
    }
  }

  if (!convId) {
    const { data, error } = await sb.from('wa_conversations')
      .insert({ ...base, customer_phone: phone })
      .select('id, case_number').single()
    if (error) throw new Error('No se pudo crear el ticket: ' + error.message)
    convId = data.id
  }

  // El cuerpo del ticket, como primer mensaje entrante del hilo
  await sb.from('wa_messages').insert({
    conversation_id: convId,
    direction: 'inbound',
    subject: t.subject,
    body: t.description + (t.botKey ? `\n\n— Registrado por ${t.botKey} (el bot no pudo resolverlo)` : ''),
    created_at: now,
  })

  const { data: conv } = await sb.from('wa_conversations').select('case_number').eq('id', convId).maybeSingle()
  return { caseNumber: conv?.case_number ?? null, conversationId: convId! }
}
