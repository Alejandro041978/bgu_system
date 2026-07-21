import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getBot } from '@/lib/bots'
import { sendWhatsAppMessage } from '@/lib/twilio'
import { recordInboxConversation } from '@/lib/inbox-record'

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

  let outSubject: string | null = null
  let storedBody = body
  let twilioSid: string | null = null
  const caseTag = conv.case_number != null ? ` [Caso #${conv.case_number}]` : ''

  if (conv.channel === 'email') {
    // ── Envío por CORREO vía N8N (Gmail, hilo nativo) ────────────────────────
    const webhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL
    if (!webhookUrl) return NextResponse.json({ error: 'N8N_EMAIL_WEBHOOK_URL no está configurada' }, { status: 400 })

    // Último mensaje entrante (para responder dentro del hilo de Gmail)
    const { data: lastIn } = await sb.from('wa_messages')
      .select('message_id').eq('conversation_id', id).eq('direction', 'in').not('message_id', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    const base = conv.subject
      ? (/^re:/i.test(conv.subject) ? conv.subject : `Re: ${conv.subject}`)
      : 'Re:'
    // Número de caso en el asunto (para que el cliente pueda referirse a él)
    outSubject = base.replace(/\s*\[Caso #\d+\]/gi, '').trim() + caseTag

    const resp = await fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.CRON_SECRET,
        to: conv.customer_email, subject: outSubject, body,
        threadId: conv.thread_ref, messageId: lastIn?.message_id ?? null,
      }),
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      return NextResponse.json({ error: `Error al enviar el correo por N8N: ${t}` }, { status: 500 })
    }
  } else {
    // ── Envío por WHATSAPP vía Twilio ────────────────────────────────────────
    const inbox = await getBot(conv.inbox_key)
    if (!inbox?.twilio_number || !inbox?.twilio_account_sid || !inbox?.twilio_auth_token) {
      return NextResponse.json({ error: 'El número del equipo no tiene credenciales de Twilio configuradas' }, { status: 400 })
    }
    // En la PRIMERA respuesta del agente, adjunta el número de caso al mensaje
    const { count: outCount } = await sb.from('wa_messages')
      .select('id', { count: 'exact', head: true }).eq('conversation_id', id).eq('direction', 'out')
    if ((outCount ?? 0) === 0 && conv.case_number != null) storedBody = `${body}\n\nCaso #${conv.case_number}`

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'
    const sent = await sendWhatsAppMessage(conv.customer_phone, storedBody, {
      from: inbox.twilio_number, sid: inbox.twilio_account_sid, token: inbox.twilio_auth_token,
    }, { statusCallback: `${appUrl}/api/whatsapp/status` })
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 500 })
    twilioSid = sent.messageSid ?? null
  }

  const { data: emp } = await sb.from('hr_employees').select('full_name').eq('user_id', user.id).maybeSingle()
  const agentNm = emp?.full_name ?? user.email ?? 'Agente'

  const { data: msg } = await sb.from('wa_messages').insert({
    conversation_id: id, direction: 'out', body: storedBody, subject: outSubject, agent_id: user.id, agent_name: agentNm,
    twilio_sid: twilioSid, delivery_status: twilioSid ? 'sent' : null,
  }).select('*').single()

  const now = new Date().toISOString()
  // Si nadie la tenía asignada, al responder queda asignada al que responde
  const patch: Record<string, unknown> = { last_message_at: now, last_message_preview: storedBody.slice(0, 120), updated_at: now, status: 'open' }
  if (!conv.assigned_to) { patch.assigned_to = user.id; patch.assigned_name = agentNm }
  // Métrica: primera respuesta (desde la llegada del cliente)
  if (!conv.first_response_at) patch.first_response_at = now
  await sb.from('wa_conversations').update(patch).eq('id', id)

  // Registro para el supervisor del equipo humano
  await recordInboxConversation(id)

  return NextResponse.json({ message: msg })
}
