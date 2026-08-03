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

// ---------------------------------------------------------------------------
// Encuentra al estudiante detrás de un contacto, por teléfono o por correo.
//
// Un ticket que se responde por correo y no tiene correo del cliente es un
// ticket que nadie puede contestar — y eso pasaba: el ticket sólo guardaba el
// correo si el bot se lo pasaba, y nunca miraba la ficha del estudiante, que
// casi siempre lo tiene. Se prefiere el personal: es el que el estudiante lee
// seguro, mientras que al institucional puede no haber entrado nunca.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buscarEstudiante(sb: any, args: { phone?: string | null; email?: string | null }) {
  const tel = (args.phone ?? '').replace('whatsapp:', '').trim()
  const mail = (args.email ?? '').trim().toLowerCase()
  const cols = 'id, first_name, last_name, second_last_name, email, email_alt, phone_number'

  if (mail && /^[^\s,()'"]+@[^\s,()'"]+$/.test(mail)) {
    const { data } = await sb.from('academic_students').select(cols)
      .or(`email.eq.${mail},email_alt.eq.${mail}`).limit(1).maybeSingle()
    if (data) return data
  }
  if (tel) {
    // El teléfono se guarda con y sin '+' según de dónde venga el dato.
    const sinMas = tel.replace(/^\+/, '')
    const { data } = await sb.from('academic_students').select(cols)
      .or(`phone_number.eq.${tel},phone_number.eq.${sinMas},phone_number.eq.+${sinMas}`).limit(1).maybeSingle()
    if (data) return data
  }
  return null
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

  // Un ticket se responde por correo, así que sin correo nace muerto. Si el bot
  // no lo trajo, se busca en la ficha del estudiante por teléfono o por correo.
  const estudiante = await buscarEstudiante(sb, { phone: phone, email: t.contactEmail })
  const correo = t.contactEmail ?? estudiante?.email ?? estudiante?.email_alt ?? null
  const nombre = t.contactName
    ?? (estudiante ? [estudiante.first_name, estudiante.last_name, estudiante.second_last_name].filter(Boolean).join(' ') : null)

  const base = {
    inbox_key: 'servicio',
    channel: 'ticket',
    status: 'open',
    assigned_to: assigned?.user_id ?? null,
    assigned_name: assigned?.name ?? null,
    customer_name: nombre,
    customer_email: correo,
    // Queda enganchado a su ficha: es lo que permite ver todas sus
    // comunicaciones juntas y resolver el correo más adelante si cambia.
    student_id: estudiante?.id ?? null,
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
        // Se completa lo que falte sin pisar lo que ya hubiera: aquí es donde
        // se perdía el correo. La conversación venía de WhatsApp —donde nadie
        // lo necesita— y al convertirse en ticket, que se responde por correo,
        // se quedaba sin él.
        ...(correo ? { customer_email: correo } : {}),
        ...(estudiante?.id ? { student_id: estudiante.id } : {}),
        ...(nombre ? { customer_name: nombre } : {}),
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
