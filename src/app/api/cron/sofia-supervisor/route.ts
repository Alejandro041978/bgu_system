import { NextRequest, NextResponse } from 'next/server'
import { analyzeSupervisor } from '@/lib/supervisor-analysis'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const r = await analyzeSupervisor(url.searchParams.get('bot') ?? 'sofia', url.searchParams.get('date'))
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
