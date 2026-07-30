import { createClient } from '@supabase/supabase-js'
import {
  isicUpsertCard, isicGetProfile, isicPutPhoto, isicConfigured, isicEnvironment,
  buildCardXml, xmlValue, type IsicCardPayload,
} from './isic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const INSTITUTION = process.env.ISIC_INSTITUTION_NAME || 'Blackwell University'

export interface IssueResult {
  ok: boolean
  cardNumber?: string
  registrationUrl?: string | null
  httpCode?: number
  notified?: boolean      // ¿se le avisó por correo?
  error?: string
  missing?: string[]      // datos del estudiante que faltan
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Vigencia: hoy + 12 meses, como recomienda ISIC. Se resta un día para que el
// carné caduque el día anterior al aniversario y no se solape con una
// revalidación que empiece ese mismo día.
function vigencia(): { from: string; to: string } {
  const from = new Date()
  const to = new Date(from)
  to.setFullYear(to.getFullYear() + 1)
  to.setDate(to.getDate() - 1)
  return { from: iso(from), to: iso(to) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function log(sb: any, row: Record<string, unknown>) {
  try { await sb.from('isic_events').insert(row) } catch { /* la bitácora no puede tumbar la emisión */ }
}

// Emite (o reemite) el carné ISIC de una solicitud de documento.
//
// Idempotente por diseño: si la solicitud ya tiene licencia asignada la reusa,
// y reenviar el mismo número a CCDB devuelve 200 en vez de crear otro carné.
// Así un reintento tras un fallo de red no quema una licencia ni duplica nada.
export async function issueIsicCard(requestId: string): Promise<IssueResult> {
  const sb = db()

  if (!isicConfigured()) return { ok: false, error: 'Faltan las credenciales de ISIC (ISIC_USER / ISIC_PASSWORD)' }

  const { data: r } = await sb.from('document_requests')
    .select('id, status, paid, student_id, document_type_id, field_values, ' +
      'student:academic_students(first_name, last_name, second_last_name, date_of_birth, email, email_alt), ' +
      'type:document_types(name, price, isic_card)')
    .eq('id', requestId).maybeSingle()
  if (!r) return { ok: false, error: 'Solicitud no encontrada' }
  if (!r.type?.isic_card) return { ok: false, error: 'Este tipo de documento no emite carné ISIC' }
  if (r.status === 'rejected') return { ok: false, error: 'La solicitud está rechazada' }
  if (Number(r.type.price) > 0 && !r.paid) return { ok: false, error: 'La solicitud tiene un cargo pendiente de pago' }

  // ── Datos del titular ─────────────────────────────────────────────────────
  // dateOfBirth, printedName, validTo e institutionName son OBLIGATORIOS para
  // CCDB. Antes de gastar una licencia comprobamos que estén: si falta algo,
  // Registros lo completa en la ficha del estudiante y reintenta. 139 de 1 971
  // estudiantes no tienen fecha de nacimiento registrada, así que este caso va
  // a ocurrir.
  const s = r.student ?? {}
  const firstName = String(s.first_name ?? '').trim()
  const lastName = [s.last_name, s.second_last_name].filter(Boolean).join(' ').trim()
  const dob = s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : ''
  // El correo lleva el enlace de alta del app móvil, así que va el PERSONAL —
  // el institucional (@blackwell.pro) es el que el estudiante suele no revisar.
  const email = String(s.email ?? s.email_alt ?? '').trim()

  const missing: string[] = []
  if (!firstName) missing.push('nombre')
  if (!lastName) missing.push('apellidos')
  if (!dob) missing.push('fecha de nacimiento')
  if (!email) missing.push('correo electrónico')
  if (missing.length) {
    return { ok: false, missing, error: `Faltan datos del estudiante: ${missing.join(', ')}` }
  }

  // printedName: ISIC pide la concatenación EXACTA de firstName + lastName.
  const printedName = `${firstName} ${lastName}`
  const { from, to } = vigencia()

  // ── Licencia ──────────────────────────────────────────────────────────────
  const environment = isicEnvironment()
  const { data: claimed, error: claimErr } = await sb.rpc('isic_claim_card', {
    p_environment: environment, p_student: r.student_id, p_request: r.id,
    p_printed_name: printedName, p_valid_from: from, p_valid_to: to,
  })
  if (claimErr) return { ok: false, error: 'No se pudo reservar una licencia: ' + claimErr.message }
  const cardNumber: string | null = claimed ?? null
  if (!cardNumber) {
    return { ok: false, error: `No quedan licencias ISIC disponibles en el entorno ${environment}. Importa el siguiente bloque antes de emitir.` }
  }

  // ── Alta en CCDB ──────────────────────────────────────────────────────────
  const payload: IsicCardPayload = {
    cardNumber, cardStatus: 'VALID', printedName, firstName, lastName,
    dateOfBirth: dob, validFrom: from, validTo: to,
    institutionName: INSTITUTION, email,
  }

  let res
  try {
    res = await isicUpsertCard(payload)
  } catch (e) {
    // Error de red: NO se libera la licencia. El carné pudo haberse creado y
    // reasignar el número lo duplicaría. Queda asignada con el error a la
    // vista, y el reintento es idempotente.
    const msg = (e as Error).message
    await sb.from('isic_cards').update({ last_error: msg, updated_at: new Date().toISOString() }).eq('card_number', cardNumber)
    await log(sb, { card_number: cardNumber, document_request_id: r.id, action: 'create', ok: false, request_body: buildCardXml(payload), response_body: msg })
    return { ok: false, cardNumber, error: 'No se pudo contactar a ISIC: ' + msg }
  }

  await log(sb, {
    card_number: cardNumber, document_request_id: r.id, action: 'create',
    http_code: res.code, ok: res.ok, request_body: buildCardXml(payload), response_body: res.body.slice(0, 8000),
  })

  // 201 creado · 200 actualizado. Cualquier otro código es fallo.
  if (res.code !== 201 && res.code !== 200) {
    // 400 = CCDB rechazó los datos, así que el carné NO existe: la licencia
    // vuelve al inventario para no perderla por un dato mal escrito.
    if (res.code === 400) await sb.rpc('isic_release_card', { p_card: cardNumber })
    else await sb.from('isic_cards').update({ last_http_code: res.code, last_error: res.body.slice(0, 2000) }).eq('card_number', cardNumber)
    return { ok: false, cardNumber: res.code === 400 ? undefined : cardNumber, httpCode: res.code, error: `ISIC respondió ${res.code}: ${res.body.slice(0, 500)}` }
  }

  // ── Foto del titular ──────────────────────────────────────────────────────
  // Va después de crear el carné porque el endpoint de foto necesita que el
  // carné ya exista. Si falla, la emisión NO se cae: el carné es válido sin
  // foto y se puede reintentar. La foto vive en nuestro Storage para siempre,
  // así que nunca depende de recuperarla del estudiante otra vez.
  let photoCode: number | null = null
  const photoPath = (r.field_values ?? {}).photo_path as string | undefined
  if (photoPath) {
    try {
      const { data: blob } = await sb.storage.from('isic-photos').download(photoPath)
      if (blob) {
        const bytes = Buffer.from(await blob.arrayBuffer())
        const mime = photoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
        const ph = await isicPutPhoto(cardNumber, bytes, mime)
        photoCode = ph.code
        await log(sb, { card_number: cardNumber, document_request_id: r.id, action: 'photo', http_code: ph.code, ok: ph.ok, response_body: ph.body.slice(0, 2000) })
      }
    } catch (e) {
      await log(sb, { card_number: cardNumber, document_request_id: r.id, action: 'photo', ok: false, response_body: (e as Error).message })
    }
  }

  // ── Enlace de alta en el app móvil ────────────────────────────────────────
  // Es lo que convierte el número en un carné usable. Si falla, la emisión
  // sigue siendo válida: el enlace se puede recuperar después.
  let registrationUrl: string | null = null
  try {
    const prof = await isicGetProfile(cardNumber)
    await log(sb, { card_number: cardNumber, document_request_id: r.id, action: 'profile', http_code: prof.code, ok: prof.ok, response_body: prof.body.slice(0, 4000) })
    if (prof.code === 200) registrationUrl = xmlValue(prof.body, 'registrationUrl')
  } catch { /* el enlace se recupera con el botón de la página de licencias */ }

  // Archivo permanente. CCDB destruye los datos del titular 6 meses después de
  // que caduca el carné; a partir de ahí esta fila es la única prueba de a
  // quién se emitió cada licencia y con qué datos.
  // Aviso al estudiante. ISIC no manda ningún correo, así que sin esto el carné
  // queda emitido y el estudiante no se entera. Best-effort: si el correo falla
  // el carné sigue válido y Registros lo reenvía desde la página de licencias.
  const now = new Date().toISOString()
  let notified = false
  try {
    const { notifyIsicCard } = await import('./isic-notify')
    const n = await notifyIsicCard({
      to: email, firstName: firstName.split(' ')[0] || 'Estudiante',
      cardNumber, registrationUrl, validTo: to,
    })
    notified = n.ok
    await log(sb, { card_number: cardNumber, document_request_id: r.id, action: 'notify', ok: n.ok, response_body: n.error ?? 'enviado a ' + email })
  } catch (e) {
    await log(sb, { card_number: cardNumber, document_request_id: r.id, action: 'notify', ok: false, response_body: (e as Error).message })
  }

  await sb.from('isic_cards').update({
    isic_status: 'VALID', last_http_code: res.code, last_error: null,
    registration_url: registrationUrl, updated_at: now,
    first_name: firstName, last_name: lastName, date_of_birth: dob, email,
    photo_path: photoPath ?? null, photo_http_code: photoCode,
    notified_at: notified ? now : null,
  }).eq('card_number', cardNumber)

  // La solicitud queda entregada. El número y el enlace viven en field_values:
  // así aparecen en la cola de Registros y en el portal del estudiante sin
  // tocar el esquema de document_requests.
  await sb.from('document_requests').update({
    status: 'delivered', emitted_at: now, updated_at: now,
    document_url: registrationUrl,
    field_values: { ...(r.field_values ?? {}), isic_card_number: cardNumber, isic_valid_to: to, isic_registration_url: registrationUrl ?? '' },
  }).eq('id', r.id)

  return { ok: true, cardNumber, registrationUrl, httpCode: res.code, notified }
}
