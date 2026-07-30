// Cliente de la Central Card Database (CCDB) de ISIC Association.
// Manual de integración v15.0. Todo el interfaz es XML sobre HTTPS con
// autenticación HTTP Basic.

const BASE = process.env.ISIC_BASE_URL || 'https://staging-api.isic.org'
const USER = process.env.ISIC_USER || ''
const PASSWORD = process.env.ISIC_PASSWORD || ''

// El entorno se deduce de la URL, no de otra variable: así no puede quedar un
// bloque de licencias de prueba apuntando a producción por un despiste.
export const isicEnvironment = (): 'staging' | 'production' =>
  BASE.includes('staging') ? 'staging' : 'production'

export const isicConfigured = () => !!(USER && PASSWORD)

// El manual pide no pasar de 3 peticiones por segundo "para que todos los
// integradores tengan una comunicación estable". Un solo carril global con
// espera mínima entre llamadas: nuestro volumen es de una por solicitud, pero
// una importación masiva pasaría por aquí igual.
const MIN_GAP_MS = 350
let lastCall = 0
async function throttle() {
  const wait = lastCall + MIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCall = Date.now()
}

// Escapa para XML. Sin esto, un apellido con "&" (o un nombre con comillas)
// produce un XML inválido y CCDB responde 400 sin explicar bien por qué.
export function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const tag = (name: string, value: string | null | undefined) =>
  value == null || value === '' ? '' : `  <${name}>${xmlEscape(String(value))}</${name}>\n`

export interface IsicCardPayload {
  cardNumber: string
  cardStatus: 'VALID' | 'VOIDED'
  printedName: string
  firstName?: string | null
  lastName?: string | null
  dateOfBirth: string          // YYYY-MM-DD
  validFrom?: string | null    // YYYY-MM-DD
  validTo: string              // YYYY-MM-DD
  institutionName: string
  email?: string | null
}

export function buildCardXml(c: IsicCardPayload): string {
  // El orden de los campos no es significativo para CCDB, pero mantenemos el
  // del ejemplo que nos dio ISIC para que un caso sea fácil de comparar con el
  // suyo cuando haya que escribirles.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<card>\n'
    + tag('cardNumber', c.cardNumber)
    + tag('cardStatus', c.cardStatus)
    + tag('printedName', c.printedName)
    + tag('firstName', c.firstName)
    + tag('lastName', c.lastName)
    + tag('dateOfBirth', c.dateOfBirth)
    + tag('validFrom', c.validFrom)
    + tag('validTo', c.validTo)
    + tag('institutionName', c.institutionName)
    + tag('email', c.email)
    + '</card>'
}

export interface IsicResponse { code: number; body: string; ok: boolean }

async function call(path: string, init: RequestInit & { body?: string }): Promise<IsicResponse> {
  if (!isicConfigured()) return { code: 0, body: 'ISIC_USER / ISIC_PASSWORD sin configurar', ok: false }
  await throttle()
  const auth = Buffer.from(`${USER}:${PASSWORD}`).toString('base64')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/xml; charset=utf-8',
      Accept: 'application/xml',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.text().catch(() => '')
  return { code: res.status, body, ok: res.ok }
}

// Crea o actualiza un carné.
//   201 = creado · 200 = ya existía y se actualizó · 400 = datos rechazados.
// Reenviar el mismo cardNumber es idempotente (devuelve 200), así que un
// reintento tras un fallo de red es seguro.
export function isicUpsertCard(c: IsicCardPayload): Promise<IsicResponse> {
  return call('/ccdb2/rest/1.0/cards', { method: 'POST', body: buildCardXml(c) })
}

// Extiende la vigencia de un carné existente. CCDB exige que el nuevo validTo
// esté al menos 180 días después del actual y no más de 547 días después del
// nuevo validFrom.
export function isicRevalidate(cardNumber: string, validFrom: string, validTo: string): Promise<IsicResponse> {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<revalidation>\n'
    + tag('validFrom', validFrom) + tag('validTo', validTo) + '</revalidation>'
  return call(`/ccdb2/rest/1.0/cards/${encodeURIComponent(cardNumber)}/revalidations`, { method: 'POST', body: xml })
}

export function isicGetCard(cardNumber: string): Promise<IsicResponse> {
  return call(`/ccdb2/rest/1.0/cards/${encodeURIComponent(cardNumber)}`, { method: 'GET' })
}

// El perfil trae el enlace de alta en el app móvil de ISIC: es lo que el
// estudiante necesita para tener su carné virtual, así que vale más que el
// número suelto.
export function isicGetProfile(cardNumber: string): Promise<IsicResponse> {
  return call(`/ccdb2/rest/1.0/cards/${encodeURIComponent(cardNumber)}/profile`, { method: 'GET' })
}

// Extractor mínimo de un valor de XML. No usamos un parser completo porque las
// respuestas que nos interesan son planas y el manual pide explícitamente
// ignorar atributos desconocidos y no depender del orden.
export function xmlValue(body: string, name: string): string | null {
  const m = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  if (!m) return null
  return m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim()
}
