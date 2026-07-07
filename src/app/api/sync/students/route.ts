import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — recibe Users de SystemActiva y upsert en academic_students.
// Find-or-create por external_id O por document_number (no duplica personas).
// Body: array [{ external_id, document_number, first_name, last_name, second_last_name, email, phone_number, country, disabled }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  const { data: existing } = await sb.from('academic_students').select('id, external_id, document_number')
  const byExt = new Map<string, string>(), byDoc = new Map<string, string>()
  for (const s of existing ?? []) {
    if (s.external_id) byExt.set(s.external_id, s.id)
    if (s.document_number) byDoc.set(String(s.document_number).trim(), s.id)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any[] = [], inserts: any[] = []
  const seenInsertDocs = new Set<string>()
  for (const r of rows) {
    const doc = r.document_number != null ? String(r.document_number).trim() : null
    const rec = {
      external_id: r.external_id ?? null,
      document_number: doc,
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      second_last_name: r.second_last_name ?? null,
      email: r.email ?? null,
      phone_number: r.phone_number ?? null,
      country: r.country ?? null,
      disabled: r.disabled ?? false,
    }
    const id = (r.external_id && byExt.get(r.external_id)) || (doc && byDoc.get(doc)) || null
    if (id) { updates.push({ id, ...rec }) }
    else {
      if (doc && seenInsertDocs.has(doc)) continue // evita duplicar mismo documento dentro del lote
      if (doc) seenInsertDocs.add(doc)
      inserts.push(rec)
    }
  }

  let inserted = 0, updated = 0
  if (updates.length) {
    const { error } = await sb.from('academic_students').upsert(updates, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    updated = updates.length
  }
  if (inserts.length) {
    const { error } = await sb.from('academic_students').insert(inserts)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = inserts.length
  }

  return NextResponse.json({ ok: true, total: rows.length, inserted, updated })
}
