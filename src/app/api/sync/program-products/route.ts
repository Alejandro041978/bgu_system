import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — mapea CADA Product de SystemActiva → un programa consolidado.
// Match: 1) por external_id (CE 1:1 y canónico), 2) por nombre (variantes B/M/D → consolidado).
// Body: array [{ external_id, name, code }]  (o { rows: [...] })
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  const { data: progs } = await sb.from('academic_programs').select('id, external_id, name')
  const byExt = new Map<string, string>(), byName = new Map<string, string>()
  for (const p of progs ?? []) {
    if (p.external_id) byExt.set(p.external_id, p.id)
    if (p.name) byName.set(String(p.name).toLowerCase().trim(), p.id)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unmatched: any[] = []
  for (const r of rows) {
    if (!r.external_id) continue
    const program_id = byExt.get(r.external_id) || (r.name && byName.get(String(r.name).toLowerCase().trim())) || null
    if (!program_id) { unmatched.push({ code: r.code, name: r.name }); continue }
    toUpsert.push({
      external_id: r.external_id, program_id,
      product_code: r.code ?? null, product_name: r.name ?? null,
      updated_at: new Date().toISOString(),
    })
  }

  let mapped = 0
  if (toUpsert.length) {
    const { error } = await sb.from('academic_program_products').upsert(toUpsert, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    mapped = toUpsert.length
  }

  return NextResponse.json({ ok: true, total: rows.length, mapped, unmatched: unmatched.length, unmatched_list: unmatched.slice(0, 50) })
}
