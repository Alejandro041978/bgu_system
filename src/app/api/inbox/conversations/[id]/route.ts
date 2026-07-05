import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function agentName(userId: string, email: string | undefined): Promise<string> {
  const { data } = await db().from('hr_employees').select('full_name').eq('user_id', userId).maybeSingle()
  return data?.full_name ?? email ?? 'Agente'
}

// GET → conversación + mensajes (y marca leído)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()

  const { data: conv } = await sb.from('wa_conversations').select('*').eq('id', id).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const { data: messages } = await sb.from('wa_messages').select('*').eq('conversation_id', id).order('created_at')

  // Marcar como leído
  if (conv.unread_count > 0) await sb.from('wa_conversations').update({ unread_count: 0 }).eq('id', id)

  return NextResponse.json({ conversation: conv, messages: messages ?? [] })
}

// PATCH { action: 'claim' | 'release' | 'close' | 'reopen' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const { action } = await req.json() as { action?: string }
  const sb = db()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (action === 'claim') { update.assigned_to = user.id; update.assigned_name = await agentName(user.id, user.email) }
  else if (action === 'release') { update.assigned_to = null; update.assigned_name = null }
  else if (action === 'close') { update.status = 'closed' }
  else if (action === 'reopen') { update.status = 'open' }
  else return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })

  const { data, error } = await sb.from('wa_conversations').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversation: data })
}
