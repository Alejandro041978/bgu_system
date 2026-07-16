import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { applySuggestion, type Suggestion } from '@/lib/apply-suggestion'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?bot=&status= → sugerencias (por defecto pendientes)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const bot = req.nextUrl.searchParams.get('bot')
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'

  let q = sb.from('supervisor_suggestions').select('*').order('created_at', { ascending: false })
  if (bot) q = q.eq('bot_key', bot)
  if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conteo de pendientes por bot (para las pestañas)
  const { data: pend } = await sb.from('supervisor_suggestions').select('bot_key').eq('status', 'pending')
  const counts: Record<string, number> = {}
  for (const r of (pend ?? []) as { bot_key: string }[]) counts[r.bot_key] = (counts[r.bot_key] ?? 0) + 1

  return NextResponse.json({ rows: data ?? [], counts })
}

// PATCH { id, action: 'approve' | 'reject' }
//   approve → aplica la mejora (prompt o base) y marca 'approved'.
export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null) as { id?: string; action?: string } | null
  if (!body?.id || !['approve', 'reject'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'id y action (approve|reject) requeridos' }, { status: 400 })
  }
  const sb = db()

  const { data: s } = await sb.from('supervisor_suggestions').select('*').eq('id', body.id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Sugerencia no encontrada' }, { status: 404 })
  if (s.status !== 'pending') return NextResponse.json({ error: 'Esta sugerencia ya fue resuelta' }, { status: 400 })

  if (body.action === 'reject') {
    await sb.from('supervisor_suggestions').update({ status: 'rejected', reviewed_by: user.id }).eq('id', body.id)
    return NextResponse.json({ ok: true })
  }

  // approve → aplicar de verdad. Si falla, la sugerencia queda pendiente (no
  // marcamos como aprobada algo que no se aplicó).
  try {
    const { ref } = await applySuggestion(s as Suggestion)
    await sb.from('supervisor_suggestions').update({
      status: 'approved', applied_at: new Date().toISOString(), applied_ref: ref, reviewed_by: user.id,
    }).eq('id', body.id)
    return NextResponse.json({ ok: true, applied: s.type, ref })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo aplicar: ' + (e as Error).message }, { status: 500 })
  }
}
