import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyInbound } from '@/lib/inbox-classify'
import { autoAssign } from '@/lib/inbox-assign'
import { recordInboxConversation } from '@/lib/inbox-record'
import { gmailHelpdeskConfigured, importEmailAttachments } from '@/lib/gmail-helpdesk'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const INBOX_KEY = 'servicio' // el equipo de Servicio al Estudiante (comparte cola con WhatsApp)

function parseEmail(from: string): { email: string; name: string } {
  const m = from.match(/<([^>]+)>/)
  const email = (m ? m[1] : from).trim().toLowerCase()
  const name = (m ? from.replace(/<[^>]+>/, '').replace(/["']/g, '').trim() : '') || email
  return { email, name }
}

function decodeB64Url(data: string): string {
  try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') } catch { return '' }
}

// Recorre el payload de Gmail (multipart) y extrae el cuerpo text/plain y text/html.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): { text: string; html: string } {
  let text = '', html = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(part: any) {
    if (!part) return
    const mime = part.mimeType ?? ''
    const data = part.body?.data
    if (mime === 'text/plain' && data) text += decodeB64Url(data)
    else if (mime === 'text/html' && data) html += decodeB64Url(data)
    if (Array.isArray(part.parts)) part.parts.forEach(walk)
  }
  walk(payload)
  return { text, html }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '\n')     // cita de Gmail/clientes
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Quita el historial citado (respuestas anteriores), encabezados de cita y firma,
// dejando solo el mensaje real que escribió la persona.
function stripQuoted(text: string): string {
  if (!text) return text
  const lines = text.split(/\r?\n/)
  const boundary = [
    /^\s*El\s.+escrib[ií][oó]:\s*$/i,                                     // Gmail ES: "El ... escribió:"
    /^\s*On\s.+wrote:\s*$/i,                                              // Gmail EN: "On ... wrote:"
    /^\s*-{2,}\s*(Original Message|Mensaje original|Forwarded message|Mensaje reenviado)\b/i,
    /^_{10,}\s*$/,                                                        // separador de Outlook
    /^\s*(De|From)\s*:\s.*@.*$/i,                                         // encabezado citado con correo
  ]
  let cut = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (boundary.some(re => re.test(lines[i]))) { cut = i; break }
  }
  let kept = lines.slice(0, cut)
  const sig = kept.findIndex(l => /^--\s*$/.test(l))                      // firma estándar
  if (sig > 0) kept = kept.slice(0, sig)
  kept = kept.filter(l => !/^\s*>/.test(l))                              // líneas citadas sueltas
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// POST desde N8N (IMAP trigger). Protegido con CRON_SECRET.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const p = await req.json() as {
      from?: string; subject?: string; text?: string; html?: string; snippet?: string
      messageId?: string; inReplyTo?: string; references?: string; threadId?: string
      gmailId?: string   // id interno de Gmail: habilita bajar adjuntos e imágenes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload?: any
    }
    const fromRaw = p.from ?? ''
    if (!fromRaw) return NextResponse.json({ error: 'from requerido' }, { status: 400 })

    const { email, name } = parseEmail(fromRaw)
    const subject = p.subject ?? '(sin asunto)'

    // Idempotencia: si ya tenemos este Message-Id, no lo volvemos a insertar.
    // Es lo que permite que la reconciliación reenvíe faltantes y que los
    // reintentos de N8N no dupliquen. (Requiere que Gmail mande messageId.)
    const sb0 = db()
    if (p.messageId) {
      const { data: dup } = await sb0.from('wa_messages')
        .select('id, conversation_id').eq('message_id', p.messageId).limit(1).maybeSingle()
      if (dup) {
        // Backfill: si el mensaje ya estaba pero sin adjuntos (ingestas viejas
        // o reintento tras un fallo de Gmail), intenta bajarlos ahora.
        let backfilled = 0
        if (p.gmailId && gmailHelpdeskConfigured()) {
          const { count } = await sb0.from('wa_attachments')
            .select('*', { count: 'exact', head: true }).eq('message_id', dup.id)
          if (!count) {
            try {
              const r = await importEmailAttachments(sb0, { gmailId: p.gmailId, messageDbId: dup.id, conversationId: dup.conversation_id })
              backfilled = r.saved
            } catch { /* best effort */ }
          }
        }
        return NextResponse.json({ ok: true, duplicate: true, attachments: backfilled, message: 'Ya estaba en el buzón' })
      }
    }

    // Cuerpo: usa text/html explícitos; si no, decodifica el payload de Gmail; si no, el snippet
    let bodyText = (p.text ?? '').trim()
    let bodyHtml = p.html ?? ''
    if (!bodyText && !bodyHtml && p.payload) {
      const ex = extractBody(p.payload)
      bodyText = ex.text.trim()
      bodyHtml = ex.html
    }
    if (!bodyText) bodyText = bodyHtml ? htmlToText(bodyHtml) : (p.snippet ?? '')
    // Deja solo el mensaje real (sin el historial citado); si quedara vacío, conserva el original
    const cleaned = stripQuoted(bodyText)
    if (cleaned) bodyText = cleaned
    bodyText = bodyText || '(sin contenido)'
    const now = new Date().toISOString()
    const sb = db()

    // ── Threading ────────────────────────────────────────────────────────────
    // El REMITENTE es el límite del caso: nunca fusionamos correos de personas
    // distintas, aunque compartan hilo/asunto (evita que respuestas a un correo
    // masivo de la oficina caigan en un mismo caso).
    let conversationId: string | null = null

    // 1) Mismo hilo de Gmail Y mismo remitente
    if (p.threadId) {
      const { data: t } = await sb.from('wa_conversations')
        .select('id').eq('inbox_key', INBOX_KEY).eq('channel', 'email').eq('thread_ref', p.threadId)
        .ilike('customer_email', email).maybeSingle()
      if (t) conversationId = t.id
    }
    // 2) Por referencias, pero solo si la conversación referida es del mismo remitente
    const refIds = `${p.references ?? ''} ${p.inReplyTo ?? ''}`.match(/<[^>]+>/g) ?? []
    if (!conversationId && refIds.length) {
      const { data: prev } = await sb.from('wa_messages').select('conversation_id').in('message_id', refIds).limit(1)
      if (prev?.[0]) {
        const { data: c } = await sb.from('wa_conversations').select('id, customer_email').eq('id', prev[0].conversation_id).maybeSingle()
        if (c && (c.customer_email ?? '').toLowerCase() === email) conversationId = c.id
      }
    }
    // 3) Conversación de correo abierta del mismo remitente
    if (!conversationId) {
      const { data: openConv } = await sb.from('wa_conversations')
        .select('id').eq('inbox_key', INBOX_KEY).eq('channel', 'email').ilike('customer_email', email).eq('status', 'open').maybeSingle()
      if (openConv) conversationId = openConv.id
    }

    // ── Crear o actualizar conversación ───────────────────────────────────────
    if (!conversationId) {
      const { language, topic } = await classifyInbound(subject, bodyText)
      // Auto-asignación por especialidad (null = queda en cola para la supervisora)
      const assigned = await autoAssign(language, topic)
      const { data: created } = await sb.from('wa_conversations').insert({
        inbox_key: INBOX_KEY, channel: 'email', customer_email: email, customer_name: name,
        subject, language, topic, thread_ref: p.threadId ?? p.messageId ?? null,
        assigned_to: assigned?.user_id ?? null, assigned_name: assigned?.name ?? null,
        status: 'open', unread_count: 1, first_customer_at: now,
        last_message_at: now, last_message_preview: subject.slice(0, 120),
      }).select('id').single()
      if (!created) return NextResponse.json({ error: 'No se pudo crear la conversación' }, { status: 500 })
      conversationId = created.id
    } else {
      const { data: c } = await sb.from('wa_conversations').select('unread_count').eq('id', conversationId).maybeSingle()
      await sb.from('wa_conversations').update({
        status: 'open', unread_count: (c?.unread_count ?? 0) + 1,
        last_message_at: now, last_message_preview: subject.slice(0, 120), updated_at: now,
      }).eq('id', conversationId)
    }

    const { data: inserted } = await sb.from('wa_messages').insert({
      conversation_id: conversationId, direction: 'in', body: bodyText,
      html: bodyHtml || null, subject, message_id: p.messageId ?? null, from_addr: email,
    }).select('id').single()

    // Adjuntos e imágenes incrustadas: se bajan directo de Gmail (por gmailId)
    // a Storage. Best-effort: si Gmail falla, el correo igual queda en el buzón
    // y el reconciliador/reintento los completa después.
    let attachments = 0
    const attachmentErrors: string[] = []
    if (p.gmailId && inserted && gmailHelpdeskConfigured()) {
      try {
        const r = await importEmailAttachments(sb, { gmailId: p.gmailId, messageDbId: inserted.id, conversationId: conversationId! })
        attachments = r.saved
        attachmentErrors.push(...r.errors)
      } catch (e) { attachmentErrors.push(e instanceof Error ? e.message : String(e)) }
    }

    // Registro para el supervisor del equipo humano
    if (conversationId) await recordInboxConversation(conversationId)

    return NextResponse.json({ ok: true, conversation_id: conversationId, attachments, attachment_errors: attachmentErrors.slice(0, 3) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
