import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — recibe Courses de SystemActiva y upsert en academic_courses.
// Body: array [{ external_id, product_external_id, code, name, credits, level, graduation_requirement }]
//       (o { rows: [...] })
// graduation_requirement (= Courses.GraduationRequirement) marca si la asignatura
// es obligatoria para egresar. Si no viene, se asume obligatoria.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()

  // programa: external_id → id
  const { data: progs } = await sb.from('academic_programs').select('id, external_id')
  const progByExt = new Map<string, string>()
  for (const p of progs ?? []) if (p.external_id) progByExt.set(p.external_id, p.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = []
  let programsMissing = 0
  for (const r of rows) {
    const program_id = r.product_external_id ? (progByExt.get(r.product_external_id) ?? null) : null
    if (!program_id) { programsMissing++; continue }
    toUpsert.push({
      external_id: r.external_id ?? null,
      program_id,
      code: r.code ?? null,
      name: r.name ?? null,
      credits: r.credits ?? null,
      level: r.level ?? null,
      graduation_requirement: r.graduation_requirement ?? null,
    })
  }

  let upserted = 0
  if (toUpsert.length) {
    const { error } = await sb.from('academic_courses').upsert(toUpsert, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    upserted = toUpsert.length
  }

  return NextResponse.json({ ok: true, total: rows.length, upserted, programs_missing: programsMissing })
}
