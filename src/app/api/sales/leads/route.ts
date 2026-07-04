import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/sales/leads?stage=...  — lista de prospectos
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const stage = req.nextUrl.searchParams.get('stage')
  const bot = req.nextUrl.searchParams.get('bot') ?? 'antonella'

  let q = db()
    .from('sales_leads')
    .select('id, name, phone, email, program_interest, prior_studies, stage, qualified, notes, updated_at, last_contact_at')
    .eq('bot_key', bot)
    .order('last_contact_at', { ascending: false, nullsFirst: false })

  if (stage) q = q.eq('stage', stage)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conteo por etapa para el resumen
  const { data: allStages } = await db()
    .from('sales_leads')
    .select('stage')
    .eq('bot_key', bot)
  const counts: Record<string, number> = {}
  for (const r of allStages ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1

  return NextResponse.json({ leads: data ?? [], counts })
}

// PATCH /api/sales/leads  { id, stage?, notes? } — edición manual de un prospecto
export async function PATCH(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, stage, notes } = await req.json() as { id?: string; stage?: string; notes?: string }
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (stage !== undefined) update.stage = stage
  if (notes !== undefined) update.notes = notes

  const { error } = await db().from('sales_leads').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
