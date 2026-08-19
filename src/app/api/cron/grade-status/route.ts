import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

// ---------------------------------------------------------------------------
// Mantener al día el veredicto de cada nota (aprobado / reprobado / pendiente).
//
// El reconstructor existía y calculaba bien, pero era un mantenimiento manual:
// había que acordarse de correrlo. Y un estado que solo se actualiza cuando
// alguien se acuerda envejece en silencio — el capstone de una estudiante decía
// "En curso" con un 90 sobre un mínimo de 80, y así llevaba meses (18/08/2026).
//
// El estado se desincroniza sobre todo cuando la NOTA llega después que el
// estado: la fila nace sin calificar y pendiente, luego el valor entra por otra
// vía y el veredicto se queda como estaba. Eran 12 notas de SystemActiva, todas
// por encima de su mínimo.
//
// Es determinista: recalcula el estado a partir de la nota y el mínimo, sin
// elegir ninguno de los dos. Correrlo cada noche no cambia nada si ya está al
// día, y por eso puede correr solo.
//
// Va DESPUÉS del cron de matrículas por asignatura, para que el mínimo se
// resuelva contra un registro completo.
// ---------------------------------------------------------------------------
async function run(req: NextRequest) {
  const base = req.nextUrl.origin
  const res = await fetch(`${base}/api/academic/grade-status/rebuild?apply=1`, {
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
