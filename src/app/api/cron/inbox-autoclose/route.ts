import { NextRequest, NextResponse } from 'next/server'
import { autocloseSweep } from '@/lib/inbox-autoclose'

export const maxDuration = 300

// Barrido horario del cierre automático de casos del buzón:
// 6h → concluyente o encuesta; evaluación → cierra; 24h sin respuesta → cierra.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await autocloseSweep())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
