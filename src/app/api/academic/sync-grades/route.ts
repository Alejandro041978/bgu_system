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
    let upserted = 0
    // Upsert en lotes de 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500).map((r: Record<string, unknown>) => ({
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

    return NextResponse.json({ ok: true, upserted })
  } catch (err) {
    try { await client?.end() } catch { /* ignore */ }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
