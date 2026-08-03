import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getBot } from '@/lib/bots'
import { sendWhatsAppMessage } from '@/lib/twilio'
import { recordInboxConversation } from '@/lib/inbox-record'
import { gmailHelpdeskConfigured, sendGmailReply, INBOX_BUCKET } from '@/lib/gmail-helpdesk'
import { buscarEstudiante } from '@/lib/inbox-ticket'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST { body } → envía la respuesta al cliente por WhatsApp y la guarda
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const { body, attachments } = await req.json() as {
    body?: string
    attachments?: { storage_path: string; filename: string; mime_type: string; size_bytes: number }[]
  }
  const adjuntos = attachments ?? []
  // Un adjunto sin texto es un envío válido: mandar solo el archivo es normal.
  if (!body?.trim() && !adjuntos.length) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })

  const sb = db()
  const { data: conv } = await sb.from('wa_conversations').select('*').eq('id', id).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  let outSubject: string | null = null
  let storedBody = body ?? ''
  let twilioSid: string | null = null
  const caseTag = conv.case_number != null ? ` [Caso #${conv.case_number}]` : ''

  // Regla de canales (usuario, 2026-07-23): correo se contesta por correo,
  // whatsapp por whatsapp, y un TICKET (registrado por Sofía o, a futuro, por
  // formulario) SIEMPRE por correo — aunque traiga teléfono: ese teléfono es
  // el diálogo con Sofía (los humanos no acceden a ese número) y un WhatsApp
  // frío desde el número humano exigiría plantilla de Meta.
  const porCorreo = conv.channel === 'email' || conv.channel === 'ticket'

  // Sin correo en el caso, se busca en la ficha del estudiante antes de
  // rendirse: casi siempre lo tiene, y pedirle al agente que lo complete a mano
  // cuando el ERP ya lo sabe es hacerle perder el tiempo. Los tickets viejos
  // nacieron sin él —Sofía no siempre lo pasaba— así que este rescate los
  // arregla al primer intento de respuesta y lo deja guardado.
  if (porCorreo && !conv.customer_email) {
    const est = await buscarEstudiante(sb, { phone: conv.customer_phone, email: null })
    const rescatado = est?.email ?? est?.email_alt ?? null
    if (rescatado) {
      conv.customer_email = rescatado
      await sb.from('wa_conversations')
        .update({ customer_email: rescatado, ...(conv.student_id ? {} : { student_id: est.id }) })
        .eq('id', id)
    }
  }
  if (porCorreo && !conv.customer_email) {
    return NextResponse.json({ error: 'Los tickets se responden por correo y este caso no tiene correo del cliente: complétalo primero en la ficha del caso.' }, { status: 400 })
  }
  if (!porCorreo && !conv.customer_phone) {
    return NextResponse.json({ error: 'Esta conversación de WhatsApp no tiene teléfono del cliente: no hay por dónde responderle.' }, { status: 400 })
  }

  if (porCorreo) {
    // ── Envío por CORREO: Gmail NATIVO (helpdesk@, hilo real); N8N queda de
    // respaldo mientras el token no tenga gmail.send ──────────────────────────
    // Último mensaje entrante (para responder dentro del hilo de Gmail)
    const { data: lastIn } = await sb.from('wa_messages')
      .select('message_id').eq('conversation_id', id).eq('direction', 'in').not('message_id', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    // Tickets sin asunto (p. ej. registrados por Sofía): correo nuevo con
    // asunto propio en vez de un "Re:" huérfano.
    const base = conv.subject
      ? (/^re:/i.test(conv.subject) ? conv.subject : `Re: ${conv.subject}`)
      : 'Atención a su solicitud — Blackwell Global University'
    // Número de caso en el asunto (para que el cliente pueda referirse a él)
    outSubject = base.replace(/\s*\[Caso #\d+\]/gi, '').trim() + caseTag

    // Los adjuntos viajan DENTRO del correo: el destinatario es alguien de
    // fuera y un enlace firmado que caduca sería peor que el archivo.
    const archivos: { filename: string; mimeType: string; content: Buffer }[] = []
    for (const a of adjuntos) {
      const { data: blob, error: dlErr } = await sb.storage.from(INBOX_BUCKET).download(a.storage_path)
      if (dlErr || !blob) {
        return NextResponse.json({ error: `No se pudo leer el adjunto "${a.filename}": ${dlErr?.message ?? 'no encontrado'}` }, { status: 500 })
      }
      archivos.push({
        filename: a.filename,
        mimeType: a.mime_type || 'application/octet-stream',
        content: Buffer.from(await blob.arrayBuffer()),
      })
    }

    let sentNative = false
    if (gmailHelpdeskConfigured()) {
      try {
        await sendGmailReply({
          to: conv.customer_email,
          subject: outSubject,
          text: body ?? '',
          threadId: conv.thread_ref,
          lastInboundGmailId: lastIn?.message_id ?? null,
          attachments: archivos,
        })
        sentNative = true
      } catch { /* sin gmail.send todavía: cae al respaldo N8N */ }
    }
    if (!sentNative) {
      // El respaldo de N8N no lleva adjuntos: mandar el texto solo sería
      // engañoso — el agente creería que el archivo salió.
      if (archivos.length) {
        return NextResponse.json({ error: 'No se pudo enviar por Gmail y el respaldo de N8N no admite adjuntos. Reintenta en un momento.' }, { status: 500 })
      }
      const webhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL
      if (!webhookUrl) return NextResponse.json({ error: 'Gmail nativo falló y N8N_EMAIL_WEBHOOK_URL no está configurada' }, { status: 500 })
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
    const creds = { from: inbox.twilio_number, sid: inbox.twilio_account_sid, token: inbox.twilio_auth_token }

    // A diferencia del correo, aquí el archivo NO viaja en el mensaje: Twilio
    // lo descarga de una URL. Se firma por una hora, que sobra para que lo baje
    // y no deja el archivo expuesto para siempre.
    const urls: string[] = []
    for (const a of adjuntos) {
      const { data: signed, error: sErr } = await sb.storage.from(INBOX_BUCKET)
        .createSignedUrl(a.storage_path, 3600)
      if (sErr || !signed?.signedUrl) {
        return NextResponse.json({ error: `No se pudo preparar el adjunto "${a.filename}" para WhatsApp: ${sErr?.message ?? 'sin URL'}` }, { status: 500 })
      }
      urls.push(signed.signedUrl)
    }

    // WhatsApp admite un adjunto por mensaje. Con varios se manda uno por
    // archivo: el texto acompaña al primero y el resto van sueltos, que es
    // como se ve en el teléfono de todos modos.
    const sent = await sendWhatsAppMessage(conv.customer_phone, storedBody, creds, {
      statusCallback: `${appUrl}/api/whatsapp/status`,
      mediaUrl: urls.slice(0, 1),
    })
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 500 })
    twilioSid = sent.messageSid ?? null

    for (const u of urls.slice(1)) {
      const extra = await sendWhatsAppMessage(conv.customer_phone, '', creds, {
        statusCallback: `${appUrl}/api/whatsapp/status`, mediaUrl: [u],
      })
      if (!extra.ok) {
        return NextResponse.json({ error: `Se envió el mensaje pero falló un adjunto: ${extra.error}` }, { status: 500 })
      }
    }
  }

  const { data: emp } = await sb.from('hr_employees').select('full_name').eq('user_id', user.id).maybeSingle()
  const agentNm = emp?.full_name ?? user.email ?? 'Agente'

  // Los adjuntos quedan colgados del mensaje enviado, en la misma tabla que los
  // que llegan: así el historial de la conversación los muestra igual venga de
  // donde venga.
  const { data: msg } = await sb.from('wa_messages').insert({
    conversation_id: id, direction: 'out', body: storedBody, subject: outSubject, agent_id: user.id, agent_name: agentNm,
    twilio_sid: twilioSid, delivery_status: twilioSid ? 'sent' : null,
  }).select('*').single()

  if (msg && adjuntos.length) {
    await sb.from('wa_attachments').insert(adjuntos.map(a => ({
      message_id: msg.id, conversation_id: id,
      filename: a.filename, mime_type: a.mime_type,
      size_bytes: a.size_bytes, storage_path: a.storage_path,
    })))
  }

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
