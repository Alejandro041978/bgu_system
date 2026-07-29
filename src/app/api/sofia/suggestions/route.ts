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

// PUT { id, ...campos } → EDITA una sugerencia pendiente antes de aprobarla.
// El supervisor propone a partir de lo que vio en las conversaciones, así que
// puede equivocarse en un dato (plazos, montos, procedimientos). Aprobar tal
// cual metería ese error al prompt o a la base de conocimientos, y el bot lo
// diría como cierto. Editar antes de aprobar es la compuerta humana.
export async function PUT(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    id?: string; title?: string; recommendation?: string; content?: string
    kb_topic?: string; kb_question?: string; kb_tags?: string; campaign_key?: string
  } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()

  const { data: s } = await sb.from('supervisor_suggestions').select('status').eq('id', b.id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Sugerencia no encontrada' }, { status: 404 })
  // Una vez aplicada, editarla aquí no cambiaría el prompt ni el artículo ya
  // creados: sería mentir sobre lo que está en producción.
  if (s.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden editar las sugerencias pendientes' }, { status: 409 })

  const patch: Record<string, string | null> = {}
  if (b.title !== undefined) {
    if (!b.title.trim()) return NextResponse.json({ error: 'El título no puede quedar vacío' }, { status: 400 })
    patch.title = b.title.trim().slice(0, 300)
  }
  if (b.content !== undefined) {
    if (!b.content.trim()) return NextResponse.json({ error: 'El contenido no puede quedar vacío' }, { status: 400 })
    patch.content = b.content.trim()
  }
  if (b.recommendation !== undefined) patch.recommendation = b.recommendation.trim().slice(0, 500) || null
  if (b.kb_topic !== undefined) patch.kb_topic = b.kb_topic.trim().slice(0, 120) || null
  if (b.kb_question !== undefined) patch.kb_question = b.kb_question.trim().slice(0, 300) || null
  if (b.kb_tags !== undefined) patch.kb_tags = b.kb_tags.trim().slice(0, 300) || null
  if (b.campaign_key !== undefined) patch.campaign_key = b.campaign_key.trim() || 'todas'
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

  const { error } = await sb.from('supervisor_suggestions').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
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
