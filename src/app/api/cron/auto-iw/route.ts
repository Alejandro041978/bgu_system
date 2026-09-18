import { NextRequest, NextResponse } from 'next/server'
import { wdb } from '@/lib/withdrawals'
import { correrAutoIW } from '@/lib/auto-iw'

export const maxDuration = 300

// IW automático por abandono: corrida nocturna (ver lib/auto-iw.ts). Con el
// interruptor apagado solo informa (modo ensayo). Protegido con CRON_SECRET.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await correrAutoIW(wdb()))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
