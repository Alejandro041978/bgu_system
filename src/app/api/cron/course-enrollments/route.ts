import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

// ---------------------------------------------------------------------------
// Mantener el registro por asignatura al día.
//
// La tabla se construyó una vez el 31 de julio y nadie la volvió a tocar: dos
// semanas después le faltaban 4.175 inscripciones y conservaba 842 que ya no
// existían. Una foto que envejece no sirve de fuente para nada, y el plan es
// justamente que llegue a ser la fuente del registro curricular.
//
// La reconstrucción es idempotente —la llave es (student_id, course_id,
// attempt)— así que correrla cada noche no duplica nada: añade lo que apareció
// y reenlaza lo que cambió.
//
// Corre DESPUÉS del cron de plan curricular y ANTES del de egresados, por el
// mismo motivo que aquél: que cada uno cuente sobre un registro completo.
// ---------------------------------------------------------------------------
async function run(req: NextRequest) {
  const base = req.nextUrl.origin
  const res = await fetch(`${base}/api/academic/course-enrollments/rebuild?apply=1&cron=1`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  })
  const d = await res.json().catch(() => ({ error: `El reconstructor respondió ${res.status}` }))
  return NextResponse.json({ ok: res.ok && !d.error, ...d }, { status: res.ok ? 200 : 500 })
}

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return run(req)
}

export async function POST(req: NextRequest) {
  return GET(req)
}
