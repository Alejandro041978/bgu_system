import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { getBot } from './bots'
import { sendWhatsAppMessage } from './twilio'
import { gmailHelpdeskConfigured, sendGmailReply } from './gmail-helpdesk'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// CIERRE AUTOMÁTICO de casos del buzón (regla del usuario: nunca manual).
// Línea de tiempo tras la última respuesta del AGENTE sin réplica del cliente:
//   6h  → ¿la respuesta fue CONCLUYENTE? (Claude) → cierra.
//         Si no → ENCUESTA (WhatsApp: responde 1/2; correo: caritas con link).
//   al evaluar → cierra ('evaluado', guarda buena/mala).
//   24h → cierra ('sin_respuesta_24h'): asumimos requerimiento atendido.
// Si el cliente responde otra cosa, la conversación sigue viva y el reloj
// vuelve a correr desde la próxima respuesta del agente.
// ---------------------------------------------------------------------------

export const surveyToken = (convId: string) =>
  createHash('sha1').update(`survey|${convId}|${process.env.CRON_SECRET}`).digest('hex').slice(0, 16)

const SURVEY_SUBJECT = '[encuesta]'   // marca: no cuenta como respuesta del agente

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function closeConv(sb: any, id: string, reason: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  await sb.from('wa_conversations').update({
    status: 'closed', closed_at: now, closed_reason: reason, unread_count: 0, updated_at: now, ...extra,
  }).eq('id', id)
}

// ¿La respuesta del agente resuelve el requerimiento? (conservador: en duda, no)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isConclusive(msgs: any[]): Promise<boolean> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return false
    const dialogo = msgs.map(m => `${m.direction === 'out' ? 'AGENTE' : 'ESTUDIANTE'}: ${(m.body ?? '').slice(0, 500)}`).join('\n---\n')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const r = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 10,
      system: 'Evalúa si la ÚLTIMA respuesta del agente resuelve por completo el requerimiento del estudiante (respuesta concluyente: entrega la información/solución pedida, sin quedar pasos pendientes del lado del agente ni preguntas abiertas al estudiante). Responde SOLO "si" o "no". En caso de duda: "no".',
      messages: [{ role: 'user', content: dialogo.slice(0, 4000) }],
    })
    const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim().toLowerCase()
    return text.startsWith('si') || text.startsWith('sí')
  } catch { return false }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendSurvey(sb: any, conv: any, lastInboundGmailId: string | null): Promise<'whatsapp' | 'email' | null> {
  const caso = conv.case_number != null ? `#${conv.case_number}` : ''
  const en = conv.language === 'en'

  // WhatsApp: opciones numéricas, lo más práctico posible
  if (conv.customer_phone) {
    const inbox = await getBot(conv.inbox_key ?? 'servicio')
    if (!inbox?.twilio_number || !inbox?.twilio_account_sid || !inbox?.twilio_auth_token) return null
    const texto = en
      ? `One last thing 🙌 How was the service on your case ${caso}?\nReply with a number:\n1️⃣ Good\n2️⃣ Bad`
      : `Para terminar 🙌 ¿Cómo fue la atención de tu caso ${caso}?\nResponde con un número:\n1️⃣ Buena\n2️⃣ Mala`
    const sent = await sendWhatsAppMessage(conv.customer_phone, texto, {
      from: inbox.twilio_number, sid: inbox.twilio_account_sid, token: inbox.twilio_auth_token,
    })
    if (!sent.ok) throw new Error(sent.error ?? 'Twilio error')
    await sb.from('wa_messages').insert({
      conversation_id: conv.id, direction: 'out', body: texto, subject: SURVEY_SUBJECT, agent_name: 'Encuesta automática',
    })
    return 'whatsapp'
  }

  // Correo (email y tickets con correo): caritas clickeables
  if (conv.customer_email && gmailHelpdeskConfigured()) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'
    const t = surveyToken(conv.id)
    const link = (r: string) => `${appUrl}/api/inbox/survey?c=${conv.id}&r=${r}&t=${t}`
    const titulo = en ? `How was the service? · Case ${caso}` : `¿Cómo fue la atención? · Caso ${caso}`
    const pregunta = en ? 'How was the service you received?' : '¿Cómo fue la atención que recibiste?'
    const html = `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;text-align:center">
  <p style="font-size:16px;color:#111827;margin:0 0 20px">${pregunta}</p>
  <table role="presentation" style="margin:0 auto"><tr>
    <td style="padding:0 10px">
      <a href="${link('buena')}" style="display:inline-block;text-decoration:none;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:16px 26px;font-size:34px">😊</a>
      <p style="font-size:12px;color:#059669;margin:6px 0 0">${en ? 'Good' : 'Buena'}</p>
    </td>
    <td style="padding:0 10px">
      <a href="${link('mala')}" style="display:inline-block;text-decoration:none;background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:16px 26px;font-size:34px">🙁</a>
      <p style="font-size:12px;color:#dc2626;margin:6px 0 0">${en ? 'Bad' : 'Mala'}</p>
    </td>
  </tr></table>
  <p style="font-size:11px;color:#9ca3af;margin:22px 0 0">Blackwell Global University · ${en ? 'One click is enough' : 'Un clic basta'}</p>
</div>`
    await sendGmailReply({
      to: conv.customer_email,
      subject: titulo,
      text: `${pregunta}\n${en ? 'Good' : 'Buena'}: ${link('buena')}\n${en ? 'Bad' : 'Mala'}: ${link('mala')}`,
      html,
      threadId: conv.thread_ref ?? null,
      lastInboundGmailId,
    })
    await sb.from('wa_messages').insert({
      conversation_id: conv.id, direction: 'out', body: pregunta + ' (encuesta 😊/🙁 enviada por correo)', subject: SURVEY_SUBJECT, agent_name: 'Encuesta automática',
    })
    return 'email'
  }
  return null
}

export interface AutocloseResult {
  revisadas: number
  cerradas_24h: number
  cerradas_concluyentes: number
  encuestas_whatsapp: number
  encuestas_correo: number
  errors: string[]
}

export async function autocloseSweep(): Promise<AutocloseResult> {
  const sb = db()
  const now = Date.now()
  const r: AutocloseResult = { revisadas: 0, cerradas_24h: 0, cerradas_concluyentes: 0, encuestas_whatsapp: 0, encuestas_correo: 0, errors: [] }

  const { data: convs } = await sb.from('wa_conversations')
    .select('id, inbox_key, channel, case_number, customer_phone, customer_email, language, survey_sent_at, thread_ref')
    .eq('inbox_key', 'servicio').eq('status', 'open')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const conv of (convs ?? []) as any[]) {
    try {
      const { data: msgsDesc } = await sb.from('wa_messages')
        .select('direction, body, subject, message_id, created_at')
        .eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(8)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const real = ((msgsDesc ?? []) as any[]).filter(m => m.subject !== SURVEY_SUBJECT)
      const last = real[0]
      // Solo actúa cuando el AGENTE habló último y el cliente calla
      if (!last || last.direction !== 'out') continue
      r.revisadas++
      const hours = (now - new Date(last.created_at).getTime()) / 3600000

      if (hours >= 24) {
        await closeConv(sb, conv.id, 'sin_respuesta_24h')
        r.cerradas_24h++
        continue
      }

      if (hours >= 6 && !conv.survey_sent_at) {
        if (await isConclusive(real.slice(0, 6).reverse())) {
          await closeConv(sb, conv.id, 'respuesta_concluyente')
          r.cerradas_concluyentes++
          continue
        }
        const lastInGmail = conv.channel === 'email'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (real.find((m: any) => m.direction === 'in' && m.message_id)?.message_id ?? null)
          : null
        const via = await sendSurvey(sb, conv, lastInGmail)
        if (via) {
          await sb.from('wa_conversations').update({ survey_sent_at: new Date().toISOString() }).eq('id', conv.id)
          if (via === 'whatsapp') r.encuestas_whatsapp++
          else r.encuestas_correo++
        }
      }
    } catch (e) {
      r.errors.push(`${conv.case_number ?? conv.id}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return r
}
