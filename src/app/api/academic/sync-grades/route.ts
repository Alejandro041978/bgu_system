import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { systemActivaClient, GRADES_QUERY } from '@/lib/systemactiva'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Sincroniza las notas desde SystemActiva → Supabase (academic_grades).
// Protegido con CRON_SECRET (igual que los demás cron).
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let client
  try {
    client = await systemActivaClient()
    const { rows } = await client.query(GRADES_QUERY)
    await client.end()

    const sb = db()

    // Filas editadas a mano en el ERP: el sync no las toca. Una corrección de
    // Registros pesa más que lo que diga SystemActiva.
    const edited = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('academic_grades')
        .select('external_id').not('edited_at', 'is', null).range(from, from + 999)
      const chunk = data ?? []
      for (const r of chunk as { external_id: string }[]) edited.add(r.external_id)
      if (chunk.length < 1000) break
    }

    let upserted = 0
    let skippedEdited = 0
    // Upsert en lotes de 500
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500).filter((r: Record<string, unknown>) => {
        if (edited.has(String(r.external_id))) { skippedEdited++; return false }
        return true
      })
      if (!slice.length) continue
      const batch = slice.map((r: Record<string, unknown>) => ({
        external_id:     r.external_id,
        document_number: r.document_number,
        email:           r.email,
        student_name:    r.student_name,
        course_code:     r.course_code,
        course_name:     r.course_name,
        credits:         r.credits,
        term_year:       r.term_year,
        term_block:      r.term_block,
        final_grade:     r.final_grade,
        retake_grade:    r.retake_grade,
        passing_score:   r.passing_score,
        group_number:    r.group_number,
        updated_at:      r.updated_at,
        synced_at:       new Date().toISOString(),
      }))
      const { error } = await sb.from('academic_grades').upsert(batch, { onConflict: 'external_id' })
      if (error) throw new Error(error.message)
      upserted += batch.length
    }

    return NextResponse.json({ ok: true, upserted, skipped_edited: skippedEdited })
  } catch (err) {
    try { await client?.end() } catch { /* ignore */ }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
