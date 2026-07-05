import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getBot } from '@/lib/bots'
import { sendWhatsAppMessage } from '@/lib/twilio'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST { body } → envía la respuesta al cliente por WhatsApp y la guarda
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const { body } = await req.json() as { body?: string }
  if (!body?.trim()) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })

  const sb = db()
  const { data: conv } = await sb.from('wa_conversations').select('*').eq('id', id).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  // Credenciales Twilio del número del equipo
  const inbox = await getBot(conv.inbox_key)
  if (!inbox?.twilio_number || !inbox?.twilio_account_sid || !inbox?.twilio_auth_token) {
    return NextResponse.json({ error: 'El número del equipo no tiene credenciales de Twilio configuradas' }, { status: 400 })
  }

  const sent = await sendWhatsAppMessage(conv.customer_phone, body, {
    from: inbox.twilio_number, sid: inbox.twilio_account_sid, token: inbox.twilio_auth_token,
  })
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 500 })

  const { data: emp } = await sb.from('hr_employees').select('full_name').eq('user_id', user.id).maybeSingle()
  const agentNm = emp?.full_name ?? user.email ?? 'Agente'

  const { data: msg } = await sb.from('wa_messages').insert({
    conversation_id: id, direction: 'out', body, agent_id: user.id, agent_name: agentNm,
  }).select('*').single()

  const now = new Date().toISOString()
  // Si nadie la tenía asignada, al responder queda asignada al que responde
  const patch: Record<string, unknown> = { last_message_at: now, last_message_preview: body.slice(0, 120), updated_at: now, status: 'open' }
  if (!conv.assigned_to) { patch.assigned_to = user.id; patch.assigned_name = agentNm }
  await sb.from('wa_conversations').update(patch).eq('id', id)

  return NextResponse.json({ message: msg })
}
