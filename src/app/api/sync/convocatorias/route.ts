import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ymd = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)

// POST (CRON_SECRET) — crea/actualiza convocatorias por (categoría, Year, Block).
// Deriva academic_semester_id por la fecha de inicio (first_day dentro del rango del semestre).
// Body: array [{ product_category_id, term_year, term_block, first_day, registration_start_date, deadline_date, end_date }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  const { data: cats } = await sb.from('academic_programs_category').select('id, name, external_id')
  const catByExt = new Map<string, { id: string; name: string }>()
  for (const c of cats ?? []) if (c.external_id) catByExt.set(c.external_id, { id: c.id, name: c.name })

  const { data: sems } = await sb.from('academic_semesters').select('id, name, start_date, end_date')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semesters = (sems ?? []) as any[]
  function semesterFor(firstDay: string | null): string | null {
    if (!firstDay) return null
    // 1) el que contiene la fecha
    const contains = semesters.find(s => ymd(s.start_date)! <= firstDay && firstDay <= ymd(s.end_date)!)
    if (contains) return contains.id
    // 2) el más cercano por fecha de inicio
    let best: { id: string; diff: number } | null = null
    for (const s of semesters) {
      const diff = Math.abs(new Date(firstDay).getTime() - new Date(ymd(s.start_date)!).getTime())
      if (!best || diff < best.diff) best = { id: s.id, diff }
    }
    return best?.id ?? null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  let categoriesMissing = 0, semestersUnmatched = 0
  for (const r of rows) {
    const cat = r.product_category_id ? catByExt.get(r.product_category_id) : undefined
    if (!cat) { categoriesMissing++; continue }
    const first_day = ymd(r.first_day)
    const academic_semester_id = semesterFor(first_day)
    if (!academic_semester_id) semestersUnmatched++
    toUpsert.push({
      name: `${cat.name} · ${r.term_year}-${r.term_block}`,
      product_category_id: cat.id,
      academic_semester_id,
      term_year: r.term_year ?? null,
      term_block: r.term_block ?? null,
      registration_start_date: ymd(r.registration_start_date),
      deadline_date: ymd(r.deadline_date),
      first_day,
      end_date: ymd(r.end_date),
    })
  }

  let upserted = 0
  if (toUpsert.length) {
    const { error } = await sb.from('convocatorias').upsert(toUpsert, { onConflict: 'product_category_id,term_year,term_block' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    upserted = toUpsert.length
  }

  return NextResponse.json({ ok: true, total: rows.length, upserted, categories_missing: categoriesMissing, semesters_unmatched: semestersUnmatched })
}
