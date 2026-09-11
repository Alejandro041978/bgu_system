import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { applySuggestion, type Suggestion } from '@/lib/apply-suggestion'
import { guardPagina } from '@/lib/page-guard'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// ---------------------------------------------------------------------------
// Mejora continua por campaña (10/09/2026): las sugerencias de Camila llevan
// campaña, y cada campaña la gobierna su propia ejecutiva. El permiso es el de
// la PÁGINA de esa campaña (campaign_titulacion, …): ver = leer propuestas,
// editar = aprobar/rechazar/corregir. El permiso central (sofia_mejoras)
// conserva potestad sobre todo — incluidas las transversales ('todas') y las
// de Sofía, que afectan más de una campaña y no son de ninguna ejecutiva.
// Antes bastaba con ser colaborador; ese hueco queda cerrado.
// ---------------------------------------------------------------------------
const CAMPANAS_VALIDAS = new Set(['titulacion', 'cobranza', 'cashpay', 'ausente', 'iw', 'loa'])

async function guardMejoras(accion: 'view' | 'edit', campana?: string | null): Promise<NextResponse | null> {
  const central = await guardPagina('sofia_mejoras', accion)
  if (!central) return null
  if (campana && CAMPANAS_VALIDAS.has(campana)) return guardPagina(`campaign_${campana}`, accion)
  return central
}

// ¿Tiene el permiso CENTRAL? (para distinguir a la ejecutiva de campaña)
async function esCentral(accion: 'view' | 'edit'): Promise<boolean> {
  return (await guardPagina('sofia_mejoras', accion)) === null
}

// GET ?bot=&status=&campaign= → sugerencias (por defecto pendientes).
// Con ?campaign= la vista es la de UNA campaña de Camila (permiso de esa
// campaña); sin él, la vista central (permiso sofia_mejoras).
export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign')
  const noAutorizado = await guardMejoras('view', campaign)
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const bot = req.nextUrl.searchParams.get('bot')
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'

  let q = sb.from('supervisor_suggestions').select('*').order('created_at', { ascending: false })
  if (campaign) q = q.eq('bot_key', 'retencion').eq('campaign_key', campaign)
  else if (bot) q = q.eq('bot_key', bot)
  if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conteo de pendientes por bot (para las pestañas)
  const { data: pend } = await sb.from('supervisor_suggestions').select('bot_key').eq('status', 'pending')
  const counts: Record<string, number> = {}
  for (const r of (pend ?? []) as { bot_key: string }[]) counts[r.bot_key] = (counts[r.bot_key] ?? 0) + 1

  // Métricas de la campaña: cuántas oportunidades identificó el supervisor y
  // en qué quedaron. Se cuentan TODAS (no solo la página listada).
  let resumen: { identificadas: number; pendientes: number; aprobadas: number; descartadas: number } | null = null
  if (campaign) {
    const { data: todas } = await sb.from('supervisor_suggestions')
      .select('status').eq('bot_key', 'retencion').eq('campaign_key', campaign)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas = (todas ?? []) as any[]
    resumen = {
      identificadas: filas.length,
      pendientes: filas.filter(f => f.status === 'pending').length,
      aprobadas: filas.filter(f => f.status === 'approved').length,
      descartadas: filas.filter(f => f.status === 'rejected').length,
    }
  }

  return NextResponse.json({ rows: data ?? [], counts, resumen })
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

  const { data: s } = await sb.from('supervisor_suggestions').select('status, bot_key, campaign_key').eq('id', b.id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Sugerencia no encontrada' }, { status: 404 })

  // Permiso: central, o el de la campaña de ESTA sugerencia (solo Camila con
  // campaña concreta; las 'todas' son del central).
  const campanaDeLaSugerencia = s.bot_key === 'retencion' && s.campaign_key && s.campaign_key !== 'todas' ? s.campaign_key : null
  if (campanaDeLaSugerencia) {
    const noAutorizado = await guardMejoras('edit', campanaDeLaSugerencia)
    if (noAutorizado) return noAutorizado
  } else if (!(await esCentral('edit'))) {
    return NextResponse.json({ error: 'Esta mejora es transversal (todas las campañas) o de otro bot: la gobierna Mejora continua central.' }, { status: 403 })
  }
  // La ejecutiva de campaña no puede MOVER la sugerencia a otra campaña (sería
  // decidir sobre una campaña ajena); el central sí.
  if (b.campaign_key !== undefined && b.campaign_key !== s.campaign_key && !(await esCentral('edit'))) {
    return NextResponse.json({ error: 'Cambiar la campaña de una mejora es del permiso central de Mejora continua.' }, { status: 403 })
  }
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

  // Aprobar/descartar exige el permiso central, o el de la campaña de ESTA
  // sugerencia (Camila con campaña concreta). Las 'todas' y las de Sofía
  // afectan a todos: solo el central decide sobre ellas.
  const campanaDeLaSugerencia = s.bot_key === 'retencion' && s.campaign_key && s.campaign_key !== 'todas' ? s.campaign_key : null
  if (campanaDeLaSugerencia) {
    const noAutorizado = await guardMejoras('edit', campanaDeLaSugerencia)
    if (noAutorizado) return noAutorizado
  } else if (!(await esCentral('edit'))) {
    return NextResponse.json({ error: 'Esta mejora es transversal (todas las campañas) o de otro bot: la aprueba Mejora continua central.' }, { status: 403 })
  }

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
