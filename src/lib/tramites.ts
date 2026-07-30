import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface CreateTramiteResult {
  ok: boolean; id?: string; status?: string; charge?: number; error?: string; code?: number
}

// Crea la solicitud de trámite y su cuota. Mismo circuito que exámenes y
// documentos: el cargo se genera aquí y el pago llega después por la
// conciliación de Flywire, nunca a mano.
export async function createTramiteRequest(opts: {
  studentId: string; tramiteTypeId: string; programId?: string | null
  requestNote?: string | null; requestedBy: string
}): Promise<CreateTramiteResult> {
  const sb = admin()

  const { data: type } = await sb.from('tramite_types').select('*').eq('id', opts.tramiteTypeId).maybeSingle()
  if (!type) return { ok: false, error: 'Trámite no encontrado', code: 404 }
  if (type.active === false) return { ok: false, error: 'Este trámite no está disponible', code: 400 }

  const nota = opts.requestNote?.toString().trim() || null
  if (type.request_note_label && !nota) {
    return { ok: false, error: `Este trámite requiere que respondas: "${type.request_note_label}"`, code: 400 }
  }

  // Un trámite en curso a la vez por tipo: pedir Re-entry dos veces generaría
  // dos cuotas por lo mismo y el administrativo no sabría cuál atender.
  const { data: enCurso } = await sb.from('tramite_requests')
    .select('id, status').eq('student_id', opts.studentId).eq('tramite_type_id', opts.tramiteTypeId)
    .in('status', ['iniciado', 'pagado']).maybeSingle()
  if (enCurso) {
    return {
      ok: false, code: 409,
      error: enCurso.status === 'iniciado'
        ? 'Ya tienes este trámite solicitado y pendiente de pago.'
        : 'Ya tienes este trámite pagado y en atención.',
    }
  }

  let chargeExternalId: string | null = null
  let status = 'pagado'   // sin costo no hay nada que esperar

  if (Number(type.price) > 0) {
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('id, convocatoria_id, program_id').eq('student_id', opts.studentId)
      .order('enrollment_date', { ascending: false }).limit(1).maybeSingle()
    chargeExternalId = crypto.randomUUID()
    const { error: chErr } = await sb.from('account_charges').insert({
      external_id: chargeExternalId, student_id: opts.studentId,
      enrollment_id: enr?.id ?? null, convocatoria_id: enr?.convocatoria_id ?? null,
      amount: Number(type.price), due_date: new Date().toISOString().slice(0, 10),
      charge_type: type.charge_concept ?? null, source: 'erp',
    })
    if (chErr) return { ok: false, error: 'No se pudo crear el cargo: ' + chErr.message, code: 500 }
    status = 'iniciado'
  }

  const { data: row, error } = await sb.from('tramite_requests').insert({
    student_id: opts.studentId, tramite_type_id: opts.tramiteTypeId,
    program_id: opts.programId ?? null, status,
    charge_external_id: chargeExternalId, request_note: nota,
    requested_by: opts.requestedBy,
    paid_at: status === 'pagado' ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) {
    // La cuota ya existe: si la solicitud no se pudo guardar, se retira para no
    // dejarle al estudiante un cobro sin trámite detrás.
    if (chargeExternalId) await sb.from('account_charges').delete().eq('external_id', chargeExternalId)
    return { ok: false, error: error.message, code: 500 }
  }

  return { ok: true, id: row.id, status, charge: Number(type.price) || 0 }
}

// Gatillo de pago: si la cuota saldada pertenece a un trámite iniciado, pasa a
// 'pagado' y aparece en la cola del administrativo.
export async function maybeMarkTramitePaid(chargeExternalId: string): Promise<boolean> {
  const sb = admin()
  const { data: req } = await sb.from('tramite_requests')
    .select('id').eq('charge_external_id', chargeExternalId).eq('status', 'iniciado').maybeSingle()
  if (!req) return false

  const { data: charge } = await sb.from('account_charges')
    .select('amount').eq('external_id', chargeExternalId).maybeSingle()
  const { data: pays } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', chargeExternalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagado = ((pays ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  if (pagado < Number(charge?.amount ?? 0) - 0.01) return false

  const now = new Date().toISOString()
  await sb.from('tramite_requests').update({ status: 'pagado', paid_at: now, updated_at: now }).eq('id', req.id)
  return true
}
