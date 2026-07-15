import { NextRequest, NextResponse } from 'next/server'
import { wdb, recomputeSituations } from '@/lib/withdrawals'
import { computeGraduates } from '@/lib/graduates'

export const maxDuration = 300

// Detecta a diario quiénes cubrieron el 100% de las asignaturas obligatorias de
// su programa y los marca como egresados. Luego recalcula las situaciones para
// que salgan de la campaña de retención y entren al embudo de titulación.
async function run() {
  const sb = wdb()
  const graduates = await computeGraduates(sb)
  const situations = await recomputeSituations(sb)
  return { ok: true, graduates, situations }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await run())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
