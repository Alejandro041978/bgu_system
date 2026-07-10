import { createClient } from '@supabase/supabase-js'
import { checkRequirements, hasBlockingFailure, type ReqCheck } from './document-requirements'
import { emitDocument } from './document-emit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface CreateRequestResult {
  ok: boolean; id?: string; status?: string; checks?: ReqCheck[]; blocked?: boolean
  document_url?: string | null; error?: string; code?: number
}

// Crea una solicitud de documento (usada por el portal admin y el estudiantil):
// valida alcance, verifica requisitos, crea el cargo si tiene costo, y auto-emite
// si es gratuito, sin etapas y con SimpleCert configurado.
export async function createDocumentRequest(opts: {
  studentId: string; documentTypeId: string; programId: string | null; requestedBy: string
}): Promise<CreateRequestResult> {
  const sb = db()
  const { data: type } = await sb.from('document_types').select('*').eq('id', opts.documentTypeId).maybeSingle()
  if (!type) return { ok: false, error: 'Tipo de documento no encontrado', code: 404 }
  if (type.active === false) return { ok: false, error: 'Este documento no está disponible', code: 400 }

  const programId = opts.programId || null

  // Alcance/disponibilidad
  const progScope: string[] = Array.isArray(type.scope_program_ids) ? type.scope_program_ids : []
  if (progScope.length > 0) {
    if (!programId || !progScope.includes(programId)) return { ok: false, error: 'Este documento no está disponible para el programa seleccionado', code: 400 }
  } else if (type.scope_category_id) {
    let catOk = false
    if (programId) {
      const { data: prog } = await sb.from('academic_programs').select('category_id').eq('id', programId).maybeSingle()
      catOk = prog?.category_id === type.scope_category_id
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
