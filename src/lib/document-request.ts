import { createClient } from '@supabase/supabase-js'
import { checkRequirements, hasBlockingFailure, type ReqCheck } from './document-requirements'
import { emitDocument } from './document-emit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface CreateRequestResult {
  ok: boolean; id?: string; status?: string; checks?: ReqCheck[]; blocked?: boolean
  document_url?: string | null; error?: string; code?: number
}

// Gatillo de pago: si la cuota saldada pertenece a una solicitud de documento
// en estado 'payment', la marca pagada y avanza su estado (in_progress con
// etapas, o ready). Los pagos SOLO llegan por importación de Flywire — nunca
// manualmente; por eso este gatillo NO inserta el pago (ya existe).
export async function maybeMarkDocumentPaid(chargeExternalId: string): Promise<boolean> {
  const sb = db()
  const { data: r } = await sb.from('document_requests')
    .select('id, charge_external_id, document_type_id, student_id, program_id')
    .eq('charge_external_id', chargeExternalId).eq('status', 'payment').maybeSingle()
  if (!r) return false

  // ¿Cuota saldada?
  const { data: charge } = await sb.from('account_charges').select('amount').eq('external_id', chargeExternalId).maybeSingle()
  const { data: pays } = await sb.from('account_payments').select('amount').eq('charge_external_id', chargeExternalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagado = ((pays ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  if (pagado < Number(charge?.amount ?? 0) - 0.01) return false

  const { data: type } = await sb.from('document_types').select('stages, is_final_degree').eq('id', r.document_type_id).maybeSingle()
  const status = (type?.stages ?? []).length > 0 ? 'in_progress' : 'ready'
  await sb.from('document_requests').update({ paid: true, status, updated_at: new Date().toISOString() }).eq('id', r.id)

  // Título final pagado → nace su expediente en la Hoja de Control de Degrees.
  if (type?.is_final_degree && r.student_id) {
    try {
      const { data: existe } = await sb.from('degree_files')
        .select('id').eq('student_id', r.student_id).eq('program_id', r.program_id ?? null).maybeSingle()
      if (!existe) {
        const { data: stu } = await sb.from('academic_students')
          .select('first_name, last_name, second_last_name, phone_number, city, country').eq('id', r.student_id).maybeSingle()
        const { data: last } = await sb.from('degree_files')
          .select('doc_code').not('doc_code', 'is', null).order('doc_code', { ascending: false }).limit(1).maybeSingle()
        await sb.from('degree_files').insert({
          student_id: r.student_id, program_id: r.program_id ?? null, document_request_id: r.id,
          doc_code: String((Number(last?.doc_code ?? 0) || 0) + 1).padStart(6, '0'),
          receiver_name: stu ? [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ') : null,
          receiver_phone: stu?.phone_number ?? null, receiver_city: stu?.city ?? null, receiver_country: stu?.country ?? null,
        })
      }
    } catch { /* la Hoja puede crearse a mano si esto falla */ }
  }
  return true
}

export interface PreviewRequestResult {
  ok: boolean; error?: string; code?: number
  checks?: ReqCheck[]; blocked?: boolean; price?: number; currency?: string; requiresNote?: boolean
}

// Valida alcance y requisitos SIN crear nada (para mostrarlos al estudiante
// antes de solicitar). No inserta cargos ni solicitudes.
export async function previewDocumentRequest(opts: {
  studentId: string; documentTypeId: string; programId: string | null
}): Promise<PreviewRequestResult> {
  const sb = db()
  const { data: type } = await sb.from('document_types').select('*').eq('id', opts.documentTypeId).maybeSingle()
  if (!type) return { ok: false, error: 'Tipo de documento no encontrado', code: 404 }
  if (type.active === false) return { ok: false, error: 'Este documento no está disponible', code: 400 }

  const programId = opts.programId || null
  const progScope: string[] = Array.isArray(type.scope_program_ids) ? type.scope_program_ids : []
  const catScope: string[] = Array.isArray(type.scope_category_ids) ? [...type.scope_category_ids] : []
  if (type.scope_category_id && !catScope.includes(type.scope_category_id)) catScope.push(type.scope_category_id)
  if (progScope.length > 0) {
    if (!programId || !progScope.includes(programId)) return { ok: false, error: 'Este documento no está disponible para el programa seleccionado', code: 400 }
  } else if (catScope.length > 0) {
    let catOk = false
    if (programId) {
      const { data: prog } = await sb.from('academic_programs').select('category_id').eq('id', programId).maybeSingle()
      catOk = !!prog?.category_id && catScope.includes(String(prog.category_id))
    }
    if (!catOk) return { ok: false, error: 'Este documento no está disponible para la categoría del programa seleccionado', code: 400 }
  }

  const checks = await checkRequirements(opts.studentId, programId, type.requirements ?? [])
  const blocked = hasBlockingFailure(checks)
  return { ok: true, checks, blocked, price: Number(type.price) || 0, currency: type.currency ?? 'USD', requiresNote: !!type.request_note_label }
}

// Crea una solicitud de documento (usada por el portal admin y el estudiantil):
// valida alcance, verifica requisitos, crea el cargo si tiene costo, y auto-emite
// si es gratuito, sin etapas y con SimpleCert configurado.
export async function createDocumentRequest(opts: {
  studentId: string; documentTypeId: string; programId: string | null; requestedBy: string
  requestNote?: string | null
}): Promise<CreateRequestResult> {
  const sb = db()
  const { data: type } = await sb.from('document_types').select('*').eq('id', opts.documentTypeId).maybeSingle()
  if (!type) return { ok: false, error: 'Tipo de documento no encontrado', code: 404 }
  if (type.active === false) return { ok: false, error: 'Este documento no está disponible', code: 400 }

  // Texto del solicitante: si el tipo lo pide, es OBLIGATORIO (p. ej. Custom
  // Attestation — qué debe decir la constancia y para qué entidad).
  const requestNote = opts.requestNote?.toString().trim() || null
  if (type.request_note_label && !requestNote) {
    return { ok: false, error: `Este documento requiere que describas tu pedido: "${type.request_note_label}"`, code: 400 }
  }

  const programId = opts.programId || null

  // Alcance/disponibilidad
  const progScope: string[] = Array.isArray(type.scope_program_ids) ? type.scope_program_ids : []
  // Varias categorías (scope_category_ids); la singular legada se pliega dentro
  const catScope: string[] = Array.isArray(type.scope_category_ids) ? [...type.scope_category_ids] : []
  if (type.scope_category_id && !catScope.includes(type.scope_category_id)) catScope.push(type.scope_category_id)
  if (progScope.length > 0) {
    if (!programId || !progScope.includes(programId)) return { ok: false, error: 'Este documento no está disponible para el programa seleccionado', code: 400 }
  } else if (catScope.length > 0) {
    let catOk = false
    if (programId) {
      const { data: prog } = await sb.from('academic_programs').select('category_id').eq('id', programId).maybeSingle()
      catOk = !!prog?.category_id && catScope.includes(String(prog.category_id))
    }
    if (!catOk) return { ok: false, error: 'Este documento no está disponible para la categoría del programa seleccionado', code: 400 }
  }

  const checks = await checkRequirements(opts.studentId, programId, type.requirements ?? [])
  const blocked = hasBlockingFailure(checks)

  let status: string
  let charge_external_id: string | null = null

  if (blocked) {
    status = 'rejected'
  } else if (Number(type.price) > 0) {
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('id, convocatoria_id').eq('student_id', opts.studentId).eq('program_id', programId).maybeSingle()
    charge_external_id = crypto.randomUUID()
    const today = new Date().toISOString().slice(0, 10)
    const { error: chErr } = await sb.from('account_charges').insert({
      external_id: charge_external_id, student_id: opts.studentId, enrollment_id: enr?.id ?? null,
      convocatoria_id: enr?.convocatoria_id ?? null, amount: Number(type.price), due_date: today,
      charge_type: type.charge_concept ?? null, source: 'erp',
    })
    if (chErr) return { ok: false, error: 'Error al crear el cargo: ' + chErr.message, code: 500 }
    status = 'payment'
  } else {
    status = (type.stages ?? []).length > 0 ? 'in_progress' : 'ready'
  }

  const { data: reqRow, error } = await sb.from('document_requests').insert({
    student_id: opts.studentId, document_type_id: opts.documentTypeId, program_id: programId,
    status, requested_by: opts.requestedBy, charge_external_id, requirements_checked: checks,
    // El texto viaja en field_values: visible en la cola y merge tag REQUEST_NOTE
    field_values: requestNote ? { request_note: requestNote } : {},
  }).select('id').single()
  if (error) return { ok: false, error: error.message, code: 500 }

  // Auto-emisión (gratuito + sin etapas + con SimpleCert).
  let document_url: string | null = null
  if (status === 'ready' && type.simplecert_project_id) {
    const res = await emitDocument(reqRow.id)
    if (res.ok) { status = 'delivered'; document_url = res.url ?? null }
  }

  return { ok: true, id: reqRow.id, status, checks, blocked, document_url }
}
