import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb, nextResolutionNumber, recomputeSituations, matriculaDelRetiro } from '@/lib/withdrawals'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0
export const maxDuration = 120

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?student_id=&type=&status= → registro de retiros
//
// student_id es lo que se usa a diario: la pregunta real casi nunca es "quiénes
// están retirados" —son 515 y la lista no cabe en la cabeza— sino "qué pasó con
// este estudiante". El listado completo sigue disponible sin el parámetro, para
// los reportes.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = wdb()
  const studentId = req.nextUrl.searchParams.get('student_id')
  const type = req.nextUrl.searchParams.get('type')
  const status = req.nextUrl.searchParams.get('status')

  let q = sb.from('student_withdrawals')
    .select('*, student:academic_students(first_name, last_name, second_last_name, document_number, email, situation), enrollment:academic_student_enrollments!enrollment_id(program:academic_programs(name))')
    .order('withdrawal_date', { ascending: false })
  if (studentId) q = q.eq('student_id', studentId)
  if (type) q = q.eq('type', type)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // La referencia del pago que levantó cada retiro reincorporado. El enlace
  // vive en reincorporated_charge_external_id; aquí se resuelve a lo que una
  // persona reconoce: la referencia del giro y la fecha en que se pagó.
  const chargeIds = [...new Set((data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => r.reincorporated_charge_external_id).filter(Boolean))] as string[]
  const pagoDe = new Map<string, { reference: string | null; paid_date: string | null }>()
  for (let i = 0; i < chargeIds.length; i += 150) {
    const { data: ps } = await sb.from('account_payments')
      .select('charge_external_id, transaction_reference, paid_date')
      .in('charge_external_id', chargeIds.slice(i, i + 150))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (ps ?? []) as any[]) {
      if (!pagoDe.has(String(p.charge_external_id))) {
        pagoDe.set(String(p.charge_external_id), {
          reference: p.transaction_reference ?? null,
          paid_date: p.paid_date ? String(p.paid_date).slice(0, 10) : null,
        })
      }
    }
  }

  // La Reversión de cada retiro (si la tuvo): pendiente en el gestor,
  // aplicada o descartada. Sale de la gestión (dato estructural), no de leer
  // la nota del retiro.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wdIds = (data ?? []).map((r: any) => String(r.id))
  const reversionDe = new Map<string, { status: string; applied_by: string | null; applied_at: string | null; nota: string | null }>()
  for (let i = 0; i < wdIds.length; i += 150) {
    const { data: gs } = await sb.from('iw_reentry_gestiones')
      .select('trigger_id, status, applied_by, applied_at, nota')
      .eq('kind', 'REVERSION').in('trigger_id', wdIds.slice(i, i + 150))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (gs ?? []) as any[]) {
      reversionDe.set(String(g.trigger_id), {
        status: g.status, applied_by: g.applied_by ?? null,
        applied_at: g.applied_at ? String(g.applied_at).slice(0, 10) : null, nota: g.nota ?? null,
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
    situation: r.student?.situation ?? null,
    program_name: r.enrollment?.program?.name ?? null,
    reentry: r.reincorporated_charge_external_id
      ? (pagoDe.get(String(r.reincorporated_charge_external_id)) ?? null)
      : null,
    reversion: reversionDe.get(String(r.id)) ?? null,
  }))
  return NextResponse.json({ rows })
}

// POST → registrar un retiro (IW o LOA). Genera el número de resolución si no se envía.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null) as {
    student_id?: string; enrollment_id?: string; type?: string; withdrawal_date?: string
    resolution_number?: string; expires_at?: string; reason?: string; note?: string
  } | null

  if (!body?.student_id || (body.type !== 'IW' && body.type !== 'LOA')) {
    return NextResponse.json({ error: 'student_id y type (IW|LOA) requeridos' }, { status: 400 })
  }
  const sb = wdb()

  // El retiro es de la MATRÍCULA: con varias, hay que decir de cuál.
  const mat = await matriculaDelRetiro(sb, body.student_id, body.enrollment_id)
  if (!mat.ok) return NextResponse.json({ error: mat.error, opciones: mat.opciones }, { status: 409 })
  const enrollmentId = mat.enrollment.id

  // Regla de retiros vigentes, POR MATRÍCULA:
  //   IW vigente  → bloquea cualquier retiro nuevo en esa matrícula.
  //   LOA vigente → bloquea otro LOA, pero PERMITE el IW (transición legítima:
  //     el LOA se cierra como 'convertido_iw', igual que hace el cron de
  //     vencimiento, enlazado por converted_to_id).
  // Un retiro en OTRA matrícula del mismo estudiante no estorba: puede estar
  // retirado del Bachelor y seguir en su Master.
  const { data: activo } = await sb.from('student_withdrawals')
    .select('id, type, resolution_number, withdrawal_date')
    .eq('enrollment_id', enrollmentId).eq('status', 'vigente').limit(1).maybeSingle()
  if (activo && !(activo.type === 'LOA' && body.type === 'IW')) {
    return NextResponse.json({
      error: `Esta matrícula (${mat.enrollment.program}) ya tiene un retiro ${activo.type} vigente (${activo.resolution_number ?? 'sin resolución'}, ${activo.withdrawal_date}). Resuélvelo primero (reincorporación o anulación) antes de registrar otro.`,
    }, { status: 409 })
  }
  const loaAConvertir = activo?.type === 'LOA' && body.type === 'IW' ? activo : null

  const date = body.withdrawal_date || new Date().toISOString().slice(0, 10)
  const resolution = body.resolution_number || await nextResolutionNumber(sb, body.student_id, body.type, date, enrollmentId)

  // El LOA dura un semestre: por defecto vence a los 6 meses.
  let expires = body.expires_at ?? null
  if (body.type === 'LOA' && !expires) {
    const d = new Date(date + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + 6)
    expires = d.toISOString().slice(0, 10)
  }

  const { data, error } = await sb.from('student_withdrawals').insert({
    student_id: body.student_id, enrollment_id: enrollmentId, type: body.type, resolution_number: resolution,
    withdrawal_date: date, expires_at: body.type === 'LOA' ? expires : null,
    reason: body.reason || null, note: body.note || null,
    status: 'vigente', source: 'erp', created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // LOA → IW manual: el LOA vigente se cierra como convertido, enlazado al IW
  if (loaAConvertir) {
    await sb.from('student_withdrawals')
      .update({ status: 'convertido_iw', converted_to_id: data.id }).eq('id', loaAConvertir.id)
  }

  await recomputeSituations(sb)
  return NextResponse.json({ ...data, loa_convertido: !!loaAConvertir })
}
