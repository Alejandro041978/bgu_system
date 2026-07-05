import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyInbound } from '@/lib/inbox-classify'

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

// POST desde N8N (IMAP trigger). Protegido con CRON_SECRET.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const p = await req.json() as {
      from?: string; subject?: string; text?: string; html?: string
      messageId?: string; inReplyTo?: string; references?: string
    }
    const fromRaw = p.from ?? ''
    if (!fromRaw) return NextResponse.json({ error: 'from requerido' }, { status: 400 })

    const { email, name } = parseEmail(fromRaw)
    const subject = p.subject ?? '(sin asunto)'
    const bodyText = (p.text ?? '').trim() || '(sin contenido)'
    const now = new Date().toISOString()
    const sb = db()

    // ── Threading ────────────────────────────────────────────────────────────
    let conversationId: string | null = null

    // 1) Por referencias del correo (In-Reply-To / References → Message-ID previo)
    const refIds = `${p.references ?? ''} ${p.inReplyTo ?? ''}`.match(/<[^>]+>/g) ?? []
    if (refIds.length) {
      const { data: prev } = await sb.from('wa_messages').select('conversation_id').in('message_id', refIds).limit(1)
      if (prev?.[0]) conversationId = prev[0].conversation_id
    }
    // 2) Por conversación de correo abierta del mismo remitente
    if (!conversationId) {
      const { data: openConv } = await sb.from('wa_conversations')
        .select('id').eq('inbox_key', INBOX_KEY).eq('channel', 'email').ilike('customer_email', email).eq('status', 'open').maybeSingle()
      if (openConv) conversationId = openConv.id
    }

    // ── Crear o actualizar conversación ───────────────────────────────────────
    if (!conversationId) {
      const { language, topic } = await classifyInbound(subject, bodyText)
      const { data: created } = await sb.from('wa_conversations').insert({
        inbox_key: INBOX_KEY, channel: 'email', customer_email: email, customer_name: name,
        subject, language, topic, thread_ref: p.messageId ?? null,
        status: 'open', unread_count: 1, last_message_at: now, last_message_preview: subject.slice(0, 120),
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

    await sb.from('wa_messages').insert({
      conversation_id: conversationId, direction: 'in', body: bodyText,
      html: p.html ?? null, subject, message_id: p.messageId ?? null, from_addr: email,
    })

    return NextResponse.json({ ok: true, conversation_id: conversationId })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
