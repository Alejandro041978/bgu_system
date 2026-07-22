import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { gmailHelpdeskConfigured, listInboxMessageIds, getGmailMessageFull } from '@/lib/gmail-helpdesk'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Backfill / reconciliación del correo del buzón, SIN depender de N8N:
// lee el INBOX de helpdesk@ directo de Gmail (gmail.readonly), detecta los
// mensajes que NO están en el buzón y los reingesta por el endpoint de
// siempre (idempotente por Message-Id → nunca duplica).
// Para cuando el trigger de N8N estuvo caído o se sospecha pérdida.
// GET ?days=2 — con sesión del ERP o Bearer CRON_SECRET.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const bearer = req.headers.get('authorization')
  if (bearer !== `Bearer ${process.env.CRON_SECRET}`) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!gmailHelpdeskConfigured()) {
    return NextResponse.json({ error: 'Gmail de helpdesk sin configurar: autorizar en /api/google/oauth/start?scope=gmail con la sesión de helpdesk@ y poner GMAIL_HELPDESK_REFRESH_TOKEN en Vercel' }, { status: 503 })
  }

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 2), 1), 30)
  const sb = db()

  const ids = await listInboxMessageIds(days)

  // ¿Cuáles ya viven en el buzón? (la ingesta guarda message_id = id de Gmail)
  const present = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('wa_messages').select('message_id').in('message_id', ids.slice(i, i + 200))
    for (const r of (data ?? [])) if (r.message_id) present.add(r.message_id)
  }
  const missing = ids.filter(id => !present.has(id))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'
  let ingresados = 0, saltados = 0
  const errors: string[] = []
  const detalle: string[] = []
  for (const id of missing) {
    try {
      const msg = await getGmailMessageFull(id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headers = (msg.payload?.headers ?? []) as any[]
      const h = (name: string) => headers.find(x => (x.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? ''
      const from = h('From')
      // Correos salientes nuestros (respuestas del buzón) también viven en
      // INBOX cuando llegan copias: se saltan los que no tienen From externo.
      if (!from) { saltados++; continue }
      const res = await fetch(`${appUrl}/api/inbox/email/incoming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({
          from,
          subject: h('Subject') || '(sin asunto)',
          snippet: msg.snippet ?? '',
          messageId: msg.id,
          threadId: msg.threadId ?? null,
          gmailId: msg.id,
          inReplyTo: h('In-Reply-To') || null,
          references: h('References') || null,
          payload: msg.payload ?? null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { errors.push(`${id}: ${d.error ?? res.status}`); continue }
      if (d.duplicate) saltados++
      else { ingresados++; detalle.push(`${from} — ${h('Subject')}`.slice(0, 90)) }
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    dias: days,
    en_gmail: ids.length,
    ya_en_buzon: present.size,
    faltantes: missing.length,
    ingresados,
    saltados,
    detalle: detalle.slice(0, 20),
    errors: errors.slice(0, 10),
  })
}
