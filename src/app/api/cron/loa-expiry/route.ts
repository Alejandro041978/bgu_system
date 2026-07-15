import { NextRequest, NextResponse } from 'next/server'
import { wdb, nextResolutionNumber, recomputeSituations } from '@/lib/withdrawals'

export const maxDuration = 300

// El LOA dura un semestre. Vencido el plazo sin reincorporación, se convierte
// en IW (retiro definitivo): el LOA queda 'convertido_iw' y se genera un IW
// nuevo con su propio número de resolución, enlazado por converted_to_id.
// Si el estudiante se reincorporó (status='reincorporado'), no se toca.
async function run() {
  const sb = wdb()
  const today = new Date().toISOString().slice(0, 10)

  const { data: expired } = await sb.from('student_withdrawals')
    .select('id, student_id, expires_at')
    .eq('type', 'LOA').eq('status', 'vigente')
    .not('expires_at', 'is', null).lte('expires_at', today)

  const converted: string[] = []
  for (const loa of (expired ?? []) as { id: string; student_id: string; expires_at: string }[]) {
    const resolution = await nextResolutionNumber(sb, loa.student_id, 'IW', loa.expires_at)
    const { data: iw } = await sb.from('student_withdrawals').insert({
      student_id: loa.student_id, type: 'IW', resolution_number: resolution,
      withdrawal_date: loa.expires_at, status: 'vigente', source: 'erp',
      note: 'Generado automáticamente: LOA vencido sin reincorporación.',
    }).select('id').single()
    await sb.from('student_withdrawals')
      .update({ status: 'convertido_iw', converted_to_id: iw?.id ?? null }).eq('id', loa.id)
    converted.push(loa.student_id)
  }

  const situations = await recomputeSituations(sb)
  return { ok: true, expired: (expired ?? []).length, converted: converted.length, situations }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await run())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
