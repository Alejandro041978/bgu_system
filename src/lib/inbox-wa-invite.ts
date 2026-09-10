// ---------------------------------------------------------------------------
// Invitación de WhatsApp en casos de correo (10/09/2026).
//
// Al crear un caso de correo con teléfono conocido se envía la plantilla
// aprobada de Meta desde el número de soporte humano (bot 'servicio'):
// "recibimos tu ticket #N; si prefieres, continúa por WhatsApp". La plantilla
// es obligatoria: fuera de la ventana de 24h Meta no permite texto libre. Si
// el estudiante responde, el webhook adjunta su mensaje AL MISMO caso y la
// conversación queda bicanal.
//
// Mejor esfuerzo siempre: un fallo de la invitación no toca el caso.
// ---------------------------------------------------------------------------
import { getBot } from '@/lib/bots'
import { sendWhatsAppTemplate } from '@/lib/twilio'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

// Content SID de la plantilla APROBADA por Meta (10/09/2026, segunda versión —
// la primera fue rechazada) en la cuenta del número de soporte. Sobreescribible
// por si se re-registra.
const CONTENT_SID = process.env.INBOX_WA_INVITE_CONTENT_SID || 'HX0958296505d3be1ac14790ae9aba1c21'

const soloDigitos = (t: string) => t.replace(/\D/g, '')
const aWhatsApp = (t: string | null | undefined): string | null => {
  const d = soloDigitos(String(t ?? ''))
  if (d.length < 8) return null
  return `whatsapp:+${d}`
}

export async function enviarInvitacionWhatsApp(sb: SB, conversationId: string): Promise<{ ok: boolean; note: string }> {
  try {
    const { data: conv } = await sb.from('wa_conversations')
      .select('id, channel, status, case_number, customer_name, customer_phone, student_id, wa_invite_sent_at')
      .eq('id', conversationId).maybeSingle()
    if (!conv) return { ok: false, note: 'conversación no encontrada' }
    if (conv.channel !== 'email') return { ok: false, note: 'solo casos de correo' }
    if (conv.wa_invite_sent_at) return { ok: false, note: 'invitación ya enviada' }
    if (conv.case_number == null) return { ok: false, note: 'el caso aún no tiene número' }

    // Teléfono: el del caso, o el de la ficha del estudiante.
    let phone = aWhatsApp(conv.customer_phone)
    let nombre = String(conv.customer_name ?? '').split(' ')[0] || 'estudiante'
    if (conv.student_id) {
      const { data: est } = await sb.from('academic_students')
        .select('first_name, phone_number').eq('id', conv.student_id).maybeSingle()
      if (!phone) phone = aWhatsApp(est?.phone_number)
      if (est?.first_name) nombre = String(est.first_name).split(' ')[0]
    }
    if (!phone) return { ok: false, note: 'sin teléfono conocido' }

    const bot = await getBot('servicio')
    if (!bot?.twilio_number || !bot.twilio_account_sid || !bot.twilio_auth_token) {
      return { ok: false, note: 'bot servicio sin credenciales Twilio' }
    }

    const r = await sendWhatsAppTemplate(phone, CONTENT_SID, {
      '1': nombre, '2': String(conv.case_number),
    }, { from: bot.twilio_number, sid: bot.twilio_account_sid, token: bot.twilio_auth_token })
    if (!r.ok) return { ok: false, note: r.error ?? 'Twilio rechazó la plantilla' }

    const now = new Date().toISOString()
    await sb.from('wa_conversations').update({
      wa_invite_sent_at: now, wa_invite_phone: phone,
    }).eq('id', conversationId)
    // La invitación queda visible en la línea de tiempo del caso.
    await sb.from('wa_messages').insert({
      conversation_id: conversationId, direction: 'out', via: 'whatsapp',
      body: `[Plantilla de WhatsApp] Hola ${nombre}, hemos recibido tu solicitud y le asignamos el ticket #${conv.case_number}. Si prefieres continuar por WhatsApp, responde ese mensaje.`,
    })
    return { ok: true, note: `invitación enviada a ${phone}` }
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : 'error' }
  }
}
