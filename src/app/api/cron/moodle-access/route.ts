import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured } from '@/lib/moodle'
import { planAccess, applyAccess } from '@/lib/moodle-access'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reconciliación diaria del acceso a Moodle: suspende a los nuevos morosos
// (vencido > 0 sin excepción vigente) y reactiva a los que pagaron o cuya
// excepción venció y volvieron a estar al día. vercel.json.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ ok: true, skipped: 'moodle_no_configurado' })
  const sb = db()
  const rows = await planAccess(sb)
  const res = await applyAccess(sb, rows)
  return NextResponse.json({ ok: true, evaluados: rows.length, ...res })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
