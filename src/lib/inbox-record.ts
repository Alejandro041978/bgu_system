import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Graba (o actualiza) una conversación del buzón humano en sofia_conversations,
// para que el supervisor nocturno del equipo pueda analizarla.
//   role 'user'      = mensaje del cliente (direction 'in')
//   role 'assistant' = respuesta del agente humano (direction 'out')
export async function recordInboxConversation(conversationId: string) {
  const sb = db()
  const { data: conv } = await sb.from('wa_conversations')
    .select('id, inbox_key, channel, customer_email').eq('id', conversationId).maybeSingle()
  if (!conv) return

  const { data: msgs } = await sb.from('wa_messages')
    .select('direction, body, created_at').eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  const messages = (msgs ?? [])
    .filter((m: { body: string | null }) => m.body)
    .map((m: { direction: string; body: string }) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body }))
  if (messages.length === 0) return

  const { error } = await sb.from('sofia_conversations').upsert({
    session_id:    `inbox:${conversationId}`,
    messages,
    message_count: messages.length,
    contact_email: conv.customer_email ?? null,
    source:        conv.channel === 'email' ? 'email' : 'whatsapp',
    bot_key:       conv.inbox_key,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'session_id' })
  if (error) console.error('recordInboxConversation error:', error.message)
}
