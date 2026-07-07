import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — recibe Products de SystemActiva y upsert en academic_programs.
// Body: array [{ external_id, name, code, product_category_id }]  (o { rows: [...] })
// Find-or-create: por external_id, o por nombre (para no duplicar los ya existentes).
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  const { data: cats } = await sb.from('academic_programs_category').select('id, external_id')
  const catByExt = new Map<string, string>()
  for (const c of cats ?? []) if (c.external_id) catByExt.set(c.external_id, c.id)

  const { data: existing } = await sb.from('academic_programs').select('id, external_id, name')
  const byExt = new Map<string, string>(), byName = new Map<string, string>()
  for (const p of existing ?? []) {
    if (p.external_id) byExt.set(p.external_id, p.id)
    if (p.name) byName.set(String(p.name).toLowerCase().trim(), p.id)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any[] = [], inserts: any[] = []
  let categoriesMissing = 0
  for (const r of rows) {
    const category_id = r.product_category_id ? (catByExt.get(r.product_category_id) ?? null) : null
    if (r.product_category_id && !category_id) categoriesMissing++
    const rec = { external_id: r.external_id ?? null, name: r.name ?? null, code: r.code ?? null, category_id }
    const id = (r.external_id && byExt.get(r.external_id)) || (r.name && byName.get(String(r.name).toLowerCase().trim())) || null
    if (id) updates.push({ id, ...rec }); else inserts.push(rec)
  }

  let updated = 0, inserted = 0
  if (updates.length) {
    const { error } = await sb.from('academic_programs').upsert(updates, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    updated = updates.length
  }
  if (inserts.length) {
    // upsert por external_id → idempotente y a prueba de llamadas repetidas/concurrentes
    const { error } = await sb.from('academic_programs').upsert(inserts, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = inserts.length
  }

  return NextResponse.json({ ok: true, total: rows.length, inserted, updated, categories_missing: categoriesMissing })
}
