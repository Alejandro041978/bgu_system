import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { applyGradeEdit } from '@/lib/grades-write'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET → Hoja de Control de exámenes (todas las solicitudes con su estudiante)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const status = req.nextUrl.searchParams.get('status')

  let q = sb.from('exam_requests')
    .select('*, exam_types(name, price), student:academic_students(first_name, last_name, second_last_name, document_number, email, email_alt)')
    .order('requested_at', { ascending: false }).limit(500)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Falta correr supabase/exam_requests.sql: ' + error.message }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map(r => ({
    ...r,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document: r.student?.document_number ? String(r.student.document_number) : '',
    student_email: r.student?.email_alt ?? r.student?.email ?? null,
  }))
  const counts = { pendiente_pago: 0, pendiente_evaluacion: 0, evaluado: 0, anulado: 0 } as Record<string, number>
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1
  return NextResponse.json({ rows, counts })
}

// PATCH { id, action: 'notificado' | 'nota' | 'anular', grade? }
export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { id?: string; action?: string; grade?: number } | null
  if (!b?.id || !b?.action) return NextResponse.json({ error: 'Faltan id y action' }, { status: 400 })

  const sb = db()
  const { data: r } = await sb.from('exam_requests').select('*').eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  const now = new Date().toISOString()

  if (b.action === 'notificado') {
    if (r.status !== 'pendiente_evaluacion') return NextResponse.json({ error: 'Solo se notifica una solicitud pagada (pendiente de evaluación)' }, { status: 400 })
    const { error } = await sb.from('exam_requests').update({ notified_at: now }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'nota') {
    if (r.status !== 'pendiente_evaluacion') return NextResponse.json({ error: 'La solicitud no está pendiente de evaluación' }, { status: 400 })
    const grade = Number(b.grade)
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) return NextResponse.json({ error: 'Nota inválida (0-100)' }, { status: 400 })
    if (!r.grade_external_id) return NextResponse.json({ error: 'La solicitud no tiene fila del acta enlazada' }, { status: 400 })

    // La nota viaja al acta como RECUPERACIÓN (la mejor gana), con auditoría,
    // blindaje contra el sync y avance de carrusel/egreso inmediatos.
    const edit = await applyGradeEdit(sb, {
      externalId: r.grade_external_id,
      changes: { retake_grade: grade },
      reason: `Examen de subsanación (solicitud ${String(b.id).slice(0, 8)})`,
      userId: user.email ?? user.id,
      origin: 'editor',
    })
    if (!edit.ok) return NextResponse.json({ error: edit.note ?? 'No se pudo escribir la nota en el acta' }, { status: 500 })

    const { error } = await sb.from('exam_requests').update({
      status: 'evaluado', result_grade: grade, evaluated_by: user.email ?? user.id, evaluated_at: now,
    }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, acta: edit.changed })
  }

  if (b.action === 'anular') {
    if (r.status === 'evaluado') return NextResponse.json({ error: 'Ya evaluada: no se puede anular' }, { status: 400 })
    // Borra el cargo si sigue impago (misma regla que documentos)
    let cuota_borrada = false
    if (r.charge_external_id) {
      const { count } = await sb.from('account_payments')
        .select('id', { count: 'exact', head: true }).eq('charge_external_id', r.charge_external_id)
      if ((count ?? 0) > 0 && r.status === 'pendiente_pago') {
        return NextResponse.json({ error: 'La cuota ya tiene pagos: registra el reembolso antes de anular' }, { status: 409 })
      }
      if ((count ?? 0) === 0) {
        await sb.from('account_charges').delete().eq('external_id', r.charge_external_id)
        cuota_borrada = true
      }
    }
    const { error } = await sb.from('exam_requests').update({ status: 'anulado' }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cuota_borrada })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
