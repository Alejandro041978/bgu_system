import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface CreateTramiteResult {
  ok: boolean; id?: string; status?: string; charge?: number; error?: string; code?: number
  // Cuando el requisito se cumple por MÁS de un programa y no se indicó cuál,
  // la pantalla debe hacer elegir entre estos.
  opciones?: { id: string; name: string }[]
}

// La situación global es el AGREGADO de todas las matrículas: quien cursa un
// doctorado siendo egresado del MBA figura "activo" — y a la vez ES egresado
// del MBA. Los requisitos de situación se evalúan también por programa
// (caso Arguello, 26/08/2026), igual que los retiros viven por matrícula.
export async function programasQueCumplenSituacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, studentId: string, situacion: string,
): Promise<{ id: string; name: string }[]> {
  const req = situacion.trim().toLowerCase()
  const ids = new Set<string>()

  if (req === 'egresado') {
    // Egresado por programa = fila en student_graduations (misma fuente que
    // computeGraduates; un titulado nunca se des-titula por recalcular).
    const { data } = await sb.from('student_graduations')
      .select('program_id').eq('student_id', studentId)
    for (const g of (data ?? []) as { program_id: string | null }[]) if (g.program_id) ids.add(g.program_id)
  } else if (req === 'retiro_permanente' || req === 'retiro_temporal') {
    // IW/LOA vigente por matrícula → el programa de esa matrícula.
    const tipo = req === 'retiro_permanente' ? 'IW' : 'LOA'
    const { data } = await sb.from('student_withdrawals')
      .select('type, status, enrollment:academic_student_enrollments!enrollment_id(program_id)')
      .eq('student_id', studentId).eq('status', 'vigente').eq('type', tipo)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const w of (data ?? []) as any[]) if (w.enrollment?.program_id) ids.add(String(w.enrollment.program_id))
  } else {
    return []   // 'activo' y demás no tienen lectura por-programa razonable
  }

  if (!ids.size) return []
  const { data: progs } = await sb.from('academic_programs')
    .select('id, name').in('id', [...ids])
  return ((progs ?? []) as { id: string; name: string }[])
    .map(p => ({ id: String(p.id), name: p.name ?? '—' }))
    .sort((a, b) => a.name.localeCompare(b.name))
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

  // Requisito de situación (Re-entry exige IW; Paperwork Degree, egresado).
  // Se valida en el servidor y no solo en la pantalla: el portal oculta el
  // botón, pero la ruta también la puede llamar Registros en nombre del
  // estudiante — y la regla es la misma para los dos.
  //
  // La situación GLOBAL no basta: es el agregado de todas las matrículas, y
  // quien cursa un programa siendo egresado (o IW) de otro no la muestra. Si
  // la global no cumple, se busca el requisito programa por programa y el
  // trámite queda amarrado al programa que lo cumple.
  let programaDelRequisito: string | null = null
  if (type.requires_situation) {
    const { data: stu } = await sb.from('academic_students')
      .select('situation').eq('id', opts.studentId).maybeSingle()
    const actual = String(stu?.situation ?? '').trim()
    let cumple = actual.toLowerCase() === String(type.requires_situation).trim().toLowerCase()
    if (!cumple) {
      const porPrograma = await programasQueCumplenSituacion(sb, opts.studentId, String(type.requires_situation))
      if (porPrograma.length) {
        if (opts.programId) {
          if (porPrograma.some(p => p.id === String(opts.programId))) {
            cumple = true
            programaDelRequisito = String(opts.programId)
          }
        } else if (porPrograma.length === 1) {
          cumple = true
          programaDelRequisito = porPrograma[0].id
        } else {
          return {
            ok: false, code: 409, opciones: porPrograma,
            error: `Cumples "${type.requires_situation}" en más de un programa: indica para cuál pides el trámite.`,
          }
        }
      }
    }
    if (!cumple) {
      return {
        ok: false, code: 409,
        error: type.requires_situation_note
          || `Este trámite exige situación "${type.requires_situation}" y la del estudiante es "${actual || 'sin registrar'}".`,
      }
    }
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
    program_id: opts.programId ?? programaDelRequisito, status,
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
