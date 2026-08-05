import { createClient } from '@supabase/supabase-js'
import { checkRequirements, hasBlockingFailure, type ReqCheck } from './document-requirements'
import { emitDocument } from './document-emit'
import { isicEnvironment } from './isic'

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

  const { data: type } = await sb.from('document_types')
    .select('stages, is_final_degree, isic_card, simplecert_project_id').eq('id', r.document_type_id).maybeSingle()
  const status = (type?.stages ?? []).length > 0 ? 'in_progress' : 'ready'
  await sb.from('document_requests').update({ paid: true, status, updated_at: new Date().toISOString() }).eq('id', r.id)

  // Documento de SimpleCert sin etapas: el pago lo emite. Un trámite que no
  // pide intervención manual no debe esperar a que alguien pulse un botón.
  //
  // Al CREAR la solicitud esto ya se hacía —un documento gratuito y sin etapas
  // se emitía en el acto—, pero al PAGARLA no: el mismo documento se comportaba
  // distinto según si costaba dinero, y justo el que cuesta se quedaba parado.
  //
  // emitDocument revalida el pago por su cuenta y deja la solicitud en
  // 'delivered'; si falla, se queda en 'ready' con el botón de Registros, que
  // es exactamente el comportamiento de antes.
  if (type?.simplecert_project_id && !type?.isic_card && status === 'ready') {
    try {
      const res = await emitDocument(r.id)
      if (!res.ok) {
        await sb.from('document_requests').update({
          notes: `Emisión automática pendiente: ${res.error ?? 'error desconocido'}`, updated_at: new Date().toISOString(),
        }).eq('id', r.id)
      }
    } catch (e) {
      console.error('emitDocument tras pago', e)
    }
  }

  // Carné internacional (ISIC): el pago lo emite solo. No hay PDF que generar
  // — se da de alta en la CCDB de ISIC y el estudiante recibe el enlace para
  // activarlo en el app móvil. Si falla (falta la fecha de nacimiento, se
  // agotó el bloque de licencias, CCDB no responde), la solicitud se queda en
  // 'ready' con el motivo a la vista y Registros reintenta desde la cola: la
  // emisión es idempotente y no gasta una licencia por intento.
  if (type?.isic_card && status === 'ready') {
    try {
      const { issueIsicCard } = await import('./isic-issue')
      const res = await issueIsicCard(r.id)
      if (!res.ok) {
        await sb.from('document_requests').update({
          notes: `Carné ISIC pendiente: ${res.error ?? 'error desconocido'}`, updated_at: new Date().toISOString(),
        }).eq('id', r.id)
      }
    } catch (e) {
      console.error('issueIsicCard tras pago', e)
    }
  }

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

// Repasa TODAS las solicitudes que esperan pago y adelanta las que ya tienen la
// cuota saldada.
//
// maybeMarkDocumentPaid es un gatillo: alguien tiene que tirar de él en el
// momento del pago. Se había colgado de la conciliación manual, de los
// descuentos y de Books, pero no de Flywire —que es por donde entra casi todo
// el dinero—, así que un estudiante pagaba y su solicitud se quedaba en
// "esperando pago" para siempre. Nadie se enteraba: la cuota salía Pagada en el
// estado de cuenta y solo la solicitud sabía que seguía esperando.
//
// El barrido cierra ese hueco por el otro lado: en vez de acordarse de llamar
// al gatillo desde cada ruta que registra pagos —hoy son quince—, comprueba el
// resultado. Una ruta nueva que olvide el gatillo ya no deja a nadie atascado;
// como mucho lo atiende con retraso.
//
// La segunda vuelta recoge las que ya están listas pero nadie emitió. Solo
// entra a los tipos SIN ETAPAS: esos nunca tuvieron un paso humano por diseño,
// así que "listo" en ellos significa "esperando un botón que no debería hacer
// falta". Los que sí tienen etapas se quedan como están — ahí el último clic de
// Registros es la revisión, y automatizarlo sería saltarse el control.
export async function sweepDocumentPayments(): Promise<{ revisadas: number; avanzadas: string[]; emitidas: string[] }> {
  const sb = db()
  const { data: pend } = await sb.from('document_requests')
    .select('id, charge_external_id').eq('status', 'payment').not('charge_external_id', 'is', null)

  const avanzadas: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((pend ?? []) as any[])) {
    // En serie a propósito: cada avance puede emitir un carné ISIC contra la
    // CCDB, que admite 3 peticiones por segundo. Son decenas de filas al día.
    try { if (await maybeMarkDocumentPaid(r.charge_external_id)) avanzadas.push(r.id) }
    catch (e) { console.error('sweepDocumentPayments', r.id, e) }
  }

  // Segunda vuelta: automáticos que se quedaron esperando un botón.
  const { data: tipos } = await sb.from('document_types')
    .select('id, stages, isic_card, simplecert_project_id').not('simplecert_project_id', 'is', null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autos = ((tipos ?? []) as any[]).filter(t => !t.isic_card && (t.stages ?? []).length === 0).map(t => t.id)

  const emitidas: string[] = []
  if (autos.length) {
    const { data: listas } = await sb.from('document_requests')
      .select('id').eq('status', 'ready').in('document_type_id', autos)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((listas ?? []) as any[])) {
      // emitDocument revalida el pago: una gratuita entra, una con cargo
      // pendiente se rechaza sola y sigue esperando.
      //
      // El motivo del fallo se escribe en la solicitud. Un barrido que falla en
      // silencio es peor que no tenerlo: la solicitud se queda igual de parada
      // y encima nadie sabe por qué.
      try {
        const res = await emitDocument(r.id)
        if (res.ok) emitidas.push(r.id)
        else await sb.from('document_requests').update({
          notes: `Emisión automática pendiente: ${res.error ?? 'error desconocido'}`, updated_at: new Date().toISOString(),
        }).eq('id', r.id)
      } catch (e) {
        console.error('sweepDocumentPayments emitir', r.id, e)
        await sb.from('document_requests').update({
          notes: `Emisión automática pendiente: ${String(e)}`, updated_at: new Date().toISOString(),
        }).eq('id', r.id).then(() => null, () => null)
      }
    }
  }
  return { revisadas: (pend ?? []).length, avanzadas, emitidas }
}

// Cuántos días antes del vencimiento se abre la revalidación del carné. El
// usuario lo pidió "a la víspera del vencimiento": un mes de margen para que el
// estudiante alcance a pagar y no se quede sin carné ni un día.
export const ISIC_REVALIDATION_WINDOW_DAYS = 30

// ¿Ya tiene carné ISIC vigente? Un número de carné es intransferible y una
// licencia cuesta dinero: quien ya tiene carné no vuelve a solicitarlo, lo
// revalida. Devuelve el motivo del bloqueo, o null si puede solicitar.
//
// Solo cuenta el carné del ENTORNO ACTIVO. Un carné de staging vive en el
// sandbox de ISIC y no existe para nadie fuera de él: dejar que bloquee una
// emisión de producción impediría estrenar el entorno real a todo el que
// hubiera participado en las pruebas. Y al revés vale igual — con la URL de
// staging puesta, un carné real no debe estorbar una prueba.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isicYaTieneCarne(sb: any, studentId: string): Promise<string | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: card } = await sb.from('isic_cards')
    .select('card_number, valid_to').eq('student_id', studentId).eq('status', 'assigned')
    .eq('environment', isicEnvironment())
    .gte('valid_to', hoy).order('valid_to', { ascending: false }).limit(1).maybeSingle()
  if (!card) return null

  const vence = new Date(String(card.valid_to) + 'T12:00:00')
  const desde = new Date(vence)
  desde.setDate(desde.getDate() - ISIC_REVALIDATION_WINDOW_DAYS)
  const f = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
  return `Ya tienes un carné internacional vigente (${card.card_number}) hasta el ${f(vence)}. `
    + `Un carné no se emite dos veces: se revalida. La revalidación estará disponible desde el ${f(desde)}.`
}

export interface PreviewRequestResult {
  ok: boolean; error?: string; code?: number
  checks?: ReqCheck[]; blocked?: boolean; price?: number; currency?: string; requiresNote?: boolean
  requiresPhoto?: boolean
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requiresPhoto = (type.requirements ?? []).some((r: any) => r?.kind === 'photo')

  // Carné ya vigente → se informa como requisito no cumplido, para que el
  // estudiante lea el motivo y la fecha en que podrá revalidar.
  if (type.isic_card) {
    const motivo = await isicYaTieneCarne(sb, opts.studentId)
    if (motivo) checks.push({ kind: 'isic_existing', ok: false, note: motivo })
  }

  const blocked = hasBlockingFailure(checks)
  return {
    ok: true, checks, blocked, price: Number(type.price) || 0, currency: type.currency ?? 'USD',
    requiresNote: !!type.request_note_label, requiresPhoto,
  }
}

// Crea una solicitud de documento (usada por el portal admin y el estudiantil):
// valida alcance, verifica requisitos, crea el cargo si tiene costo, y auto-emite
// si es gratuito, sin etapas y con SimpleCert configurado.
export async function createDocumentRequest(opts: {
  studentId: string; documentTypeId: string; programId: string | null; requestedBy: string
  requestNote?: string | null; photoPath?: string | null
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

  // Foto del titular: si el tipo la exige, tiene que venir ya subida y validada
  // (el endpoint /api/student/isic-photo comprueba color, 500×500 px y 5 MB).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requiresPhoto = (type.requirements ?? []).some((r: any) => r?.kind === 'photo')
  const photoPath = opts.photoPath?.toString().trim() || null
  if (requiresPhoto && !photoPath) {
    return { ok: false, error: 'Este documento requiere que subas tu foto antes de solicitarlo', code: 400 }
  }

  // Un carné vigente no se emite otra vez: se revalida.
  if (type.isic_card) {
    const motivo = await isicYaTieneCarne(sb, opts.studentId)
    if (motivo) return { ok: false, error: motivo, code: 409 }
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
    field_values: {
      ...(requestNote ? { request_note: requestNote } : {}),
      ...(photoPath ? { photo_path: photoPath } : {}),
    },
  }).select('id').single()
  if (error) return { ok: false, error: error.message, code: 500 }

  // Auto-emisión (gratuito + sin etapas + con SimpleCert).
  let document_url: string | null = null
  if (status === 'ready' && type.simplecert_project_id) {
    const res = await emitDocument(reqRow.id)
    if (res.ok) { status = 'delivered'; document_url = res.url ?? null }
  } else if (status === 'ready' && type.isic_card) {
    // Carné ISIC sin costo (o de cortesía): se emite en el acto.
    const { issueIsicCard } = await import('./isic-issue')
    const res = await issueIsicCard(reqRow.id)
    if (res.ok) { status = 'delivered'; document_url = res.registrationUrl ?? null }
  }

  return { ok: true, id: reqRow.id, status, checks, blocked, document_url }
}
