import { NextRequest, NextResponse } from 'next/server'
import { wdb } from '@/lib/withdrawals'

export const maxDuration = 120

// Verifica los compromisos vencidos contra la realidad del aula.
//
// Es la pieza que impide que el bot se engañe a sí mismo: un "sí, ya voy a
// entrar" dicho para que dejen de escribir es gratis. Aquí se compara la fecha
// prometida contra last_moodle_access:
//   entró después de prometer  -> commitment_kept = true   (retención real)
//   no entró                   -> commitment_kept = false  (pasa a NIVEL 3)
//
// Se corre después del cron de seguimiento, que es quien refresca Moodle.
async function run() {
  const sb = wdb()
  const today = new Date().toISOString().slice(0, 10)

  const { data: pend } = await sb.from('student_tracking')
    .select('student_id, commitment_date, commitment_at, last_moodle_access')
    .not('commitment_date', 'is', null)
    .is('commitment_kept', null)
    .lte('commitment_date', today)

  let kept = 0, broken = 0
  for (const r of (pend ?? []) as { student_id: string; commitment_date: string; commitment_at: string | null; last_moodle_access: string | null }[]) {
    // Cumplió si entró al aula después de haberlo prometido.
    const desde = r.commitment_at ? new Date(r.commitment_at) : new Date(r.commitment_date + 'T00:00:00Z')
    const volvio = !!r.last_moodle_access && new Date(r.last_moodle_access) >= desde
    await sb.from('student_tracking').update({ commitment_kept: volvio }).eq('student_id', r.student_id)
    if (volvio) kept++; else broken++
  }

  return { ok: true, revisados: (pend ?? []).length, cumplieron: kept, incumplieron: broken }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try { return NextResponse.json(await run()) }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function POST(req: NextRequest) { return GET(req) }
