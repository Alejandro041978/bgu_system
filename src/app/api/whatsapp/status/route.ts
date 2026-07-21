import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Los estados de Twilio llegan fuera de orden a veces; nunca degradar
// (un "delivered" tardío no debe pisar un "read").
const RANK: Record<string, number> = { queued: 1, sent: 2, delivered: 3, read: 4, failed: 5, undelivered: 5 }

// Webhook de estado de Twilio (statusCallback de los mensajes salientes del
// buzón): sent → delivered → read. Solo actualiza mensajes cuyo SID ya está
// registrado — un SID desconocido se ignora, así que el endpoint no expone ni
// acepta nada más.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const sid = form?.get('MessageSid')?.toString()
  const status = form?.get('MessageStatus')?.toString()?.toLowerCase()
  if (!sid || !status || !RANK[status]) return NextResponse.json({ ok: true })

  const sb = db()
  const { data: msg } = await sb.from('wa_messages')
    .select('id, delivery_status').eq('twilio_sid', sid).maybeSingle()
  if (!msg) return NextResponse.json({ ok: true })

  const current = RANK[msg.delivery_status ?? ''] ?? 0
  if (RANK[status] > current) {
    await sb.from('wa_messages').update({ delivery_status: status }).eq('id', msg.id)
  }
  return NextResponse.json({ ok: true })
}
