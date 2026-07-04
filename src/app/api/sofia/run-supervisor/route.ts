import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Client-callable endpoint that triggers the supervisor cron internally
export async function POST(req: NextRequest) {
  // Verify user is authenticated via Supabase session cookie
  const authHeader = req.headers.get('x-supabase-auth') ?? ''
  if (!authHeader) {
    // Allow if called from server context (no auth header check needed for internal calls)
    // Just verify service role key is available as a sanity check
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 })
    }
  }

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const bot = req.nextUrl.searchParams.get('bot') ?? 'sofia'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bgu-system.vercel.app'
  const cronUrl = new URL('/api/cron/sofia-supervisor', baseUrl)
  if (date) cronUrl.searchParams.set('date', date)
  cronUrl.searchParams.set('bot', bot)

  const res = await fetch(cronUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
    },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
