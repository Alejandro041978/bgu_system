import { NextRequest, NextResponse } from 'next/server'
import { wdb, nextResolutionNumber, recomputeSituations } from '@/lib/withdrawals'
import { notificarEstudiante, plantillaIW } from '@/lib/student-notifications'

export const maxDuration = 300

// El LOA dura un semestre. Vencido el plazo sin reincorporación, se convierte
// en IW (retiro definitivo): el LOA queda 'convertido_iw' y se genera un IW
// nuevo con su propio número de resolución, enlazado por converted_to_id.
// Si el estudiante se reincorporó (status='reincorporado'), no se toca.
async function run() {
  const sb = wdb()
  const today = new Date().toISOString().slice(0, 10)

  const { data: expired } = await sb.from('student_withdrawals')
    .select('id, student_id, expires_at, enrollment_id')
    .eq('type', 'LOA').eq('status', 'vigente')
    .not('expires_at', 'is', null).lte('expires_at', today)

  const converted: string[] = []
  for (const loa of (expired ?? []) as { id: string; student_id: string; expires_at: string; enrollment_id: string | null }[]) {
    const resolution = await nextResolutionNumber(sb, loa.student_id, 'IW', loa.expires_at, loa.enrollment_id)
    // El IW hereda la matrícula del LOA: es el mismo retiro, que cambió de tipo.
    const { data: iw } = await sb.from('student_withdrawals').insert({
      student_id: loa.student_id, enrollment_id: loa.enrollment_id, type: 'IW', resolution_number: resolution,
      withdrawal_date: loa.expires_at, status: 'vigente', source: 'erp',
      note: 'Generado automáticamente: LOA vencido sin reincorporación.',
    }).select('id').single()
    await sb.from('student_withdrawals')
      .update({ status: 'convertido_iw', converted_to_id: iw?.id ?? null }).eq('id', loa.id)
    converted.push(loa.student_id)

    // Aviso al estudiante (bitácora student_notifications): su LOA venció y
    // pasó a IW. Best-effort — el correo jamás tumba la conversión.
    try {
      const { data: stuN } = await sb.from('academic_students')
        .select('first_name, last_name').eq('id', loa.student_id).maybeSingle()
      const { data: enrN } = loa.enrollment_id
        ? await sb.from('academic_student_enrollments')
          .select('academic_programs(name)').eq('id', loa.enrollment_id).maybeSingle()
        : { data: null }
      const p = plantillaIW({
        nombre: [stuN?.first_name, stuN?.last_name].filter(Boolean).join(' ') || 'estudiante',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        programa: (enrN as any)?.academic_programs?.name ?? 'tu programa',
        resolucion: resolution, fechaRetiro: loa.expires_at, desdeLOA: true,
      })
      await notificarEstudiante(sb, {
        studentId: loa.student_id, enrollmentId: loa.enrollment_id,
        kind: 'iw_aplicado', subject: p.subject, html: p.html,
        relatedId: iw?.id ?? null, triggeredBy: 'cron:loa-expiry',
      })
    } catch { /* best effort */ }
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
