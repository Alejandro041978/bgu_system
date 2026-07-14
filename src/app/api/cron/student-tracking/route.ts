import { NextRequest, NextResponse } from 'next/server'
import { runStudentTracking } from '@/lib/student-tracking'

export const maxDuration = 300

// Recalcula el seguimiento de estudiantes (deuda, últimas conexiones, riesgo).
// Protegido con CRON_SECRET. Se ejecuta a diario por Vercel Cron.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await runStudentTracking()
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
