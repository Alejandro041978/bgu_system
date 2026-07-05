import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const COLS = 'id, customer_phone, customer_name, status, assigned_to, assigned_name, unread_count, last_message_at, last_message_preview'

// GET ?filter=queue|mine|closed → lista de conversaciones + conteos para las pestañas
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const filter = req.nextUrl.searchParams.get('filter') ?? 'queue'
  const sb = db()

  let q = sb.from('wa_conversations').select(COLS).order('last_message_at', { ascending: false, nullsFirst: false })
  if (filter === 'queue') q = q.eq('status', 'open').is('assigned_to', null)
  else if (filter === 'mine') q = q.eq('status', 'open').eq('assigned_to', user.id)
  else if (filter === 'closed') q = q.eq('status', 'closed')
  const { data, error } = await q.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conteos para badges
  const [{ count: queueCount }, { count: mineCount }] = await Promise.all([
    sb.from('wa_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open').is('assigned_to', null),
    sb.from('wa_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('assigned_to', user.id),
  ])

  return NextResponse.json({ conversations: data ?? [], counts: { queue: queueCount ?? 0, mine: mineCount ?? 0 } })
}
