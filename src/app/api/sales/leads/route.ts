import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/sales/leads?bot=&funnel=&stage=  — prospectos + datos de apoyo
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const bot = sp.get('bot') ?? 'antonella'
  const funnel = sp.get('funnel')
  const stage = sp.get('stage')
  const sb = db()

  let q = sb.from('sales_leads')
    .select('id, name, phone, email, program_interest, prior_studies, stage, qualified, notes, updated_at, last_contact_at, funnel_id, convocatoria_id')
    .eq('bot_key', bot)
    .order('last_contact_at', { ascending: false, nullsFirst: false })
  if (funnel) q = q.eq('funnel_id', funnel)
  if (stage) q = q.eq('stage', stage)
  const { data: leads, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conteo por etapa (para el bot + embudo seleccionados)
  let cq = sb.from('sales_leads').select('stage').eq('bot_key', bot)
  if (funnel) cq = cq.eq('funnel_id', funnel)
  const { data: allStages } = await cq
  const counts: Record<string, number> = {}
  for (const r of allStages ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1

  // Datos de apoyo
  const [{ data: bots }, { data: funnels }, { data: convs }] = await Promise.all([
    sb.from('bots').select('key, name').eq('role', 'ventas').eq('active', true).order('name'),
    sb.from('sales_funnels').select('id, bot_key, name, scope_category_id, scope_program_ids, sort_order').eq('active', true).order('sort_order'),
    sb.from('convocatorias').select('id, name, product_category_id').order('name'),
  ])

  return NextResponse.json({ leads: leads ?? [], counts, bots: bots ?? [], funnels: funnels ?? [], convocatorias: convs ?? [] })
}

// PATCH /api/sales/leads { id, stage?, notes?, funnel_id?, convocatoria_id? }
export async function PATCH(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json() as { id?: string; stage?: string; notes?: string; funnel_id?: string | null; convocatoria_id?: string | null }
  if (!b.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const sb = db()
  const { data: cur } = await sb.from('sales_leads').select('stage, convocatoria_id').eq('id', b.id).maybeSingle()
  const newStage = b.stage ?? cur?.stage
  const newConv = b.convocatoria_id !== undefined ? b.convocatoria_id : cur?.convocatoria_id

  // La convocatoria es obligatoria para inscribir (ahí arranca admisión/matrícula)
  if (newStage === 'inscrito' && !newConv) {
    return NextResponse.json({ error: 'convocatoria_required' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.stage !== undefined) update.stage = b.stage
  if (b.notes !== undefined) update.notes = b.notes
  if (b.funnel_id !== undefined) update.funnel_id = b.funnel_id || null
  if (b.convocatoria_id !== undefined) update.convocatoria_id = b.convocatoria_id || null

  const { error } = await sb.from('sales_leads').update(update).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
