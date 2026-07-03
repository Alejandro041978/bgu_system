import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const db = supabase as any

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const [yest, tod, recent] = await Promise.all([
    db.from('sofia_conversations')
      .select('session_id, message_count, source, created_at', { count: 'exact' })
      .gte('created_at', `${yesterday}T00:00:00.000Z`)
      .lte('created_at', `${yesterday}T23:59:59.999Z`),
    db.from('sofia_conversations')
      .select('session_id, message_count, source, created_at', { count: 'exact' })
      .gte('created_at', `${today}T00:00:00.000Z`),
    db.from('sofia_conversations')
      .select('session_id, message_count, source, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return NextResponse.json({
    yesterday: { date: yesterday, count: yest.count, rows: yest.data },
    today: { date: today, count: tod.count, rows: tod.data },
    most_recent_5: recent.data,
    errors: { yest: yest.error?.message, tod: tod.error?.message, recent: recent.error?.message },
  })
}
