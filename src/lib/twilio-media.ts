import type Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Media entrante de WhatsApp (Twilio) → bloques de contenido para Claude.
//
// Twilio manda el archivo como una URL (MediaUrl0, MediaUrl1…) que requiere las
// credenciales de la cuenta para descargarse. Claude (Opus 4.8) interpreta
// imágenes y PDF de forma nativa, así que basta con bajarlo, pasarlo a base64 y
// armar el bloque correcto.
//
// Antes esto se ignoraba por completo: un estudiante que mandaba solo una foto
// (su comprobante, un error del aula) no recibía respuesta alguna.
// ---------------------------------------------------------------------------

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const PDF_TYPE = 'application/pdf'
const MAX_BYTES = 5 * 1024 * 1024   // 5 MB por archivo (límite práctico de la API)

export interface TwilioMedia { url: string; contentType: string }

// Lee NumMedia / MediaUrlN / MediaContentTypeN del payload de Twilio.
export function extractMedia(params: Record<string, string>): TwilioMedia[] {
  const n = parseInt(params['NumMedia'] ?? '0', 10)
  if (!Number.isFinite(n) || n <= 0) return []
  const out: TwilioMedia[] = []
  for (let i = 0; i < n; i++) {
    const url = params[`MediaUrl${i}`]
    const contentType = params[`MediaContentType${i}`] ?? ''
    if (url) out.push({ url, contentType })
  }
  return out
}

export interface MediaResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[]              // bloques image/document para el content de Claude
  note: string              // acuse de qué se recibió (para el historial y el caso vacío)
  unsupported: string[]     // tipos que no se pudieron interpretar
}

// Descarga cada archivo de Twilio y arma los bloques. Sólo imágenes y PDF; el
// resto se reporta como no soportado (para que Sofía pueda decirlo, no ignorarlo).
export async function fetchMediaBlocks(
  media: TwilioMedia[],
  creds: { sid?: string; token?: string },
): Promise<MediaResult> {
  const sid = creds.sid ?? process.env.TWILIO_ACCOUNT_SID
  const token = creds.token ?? process.env.TWILIO_AUTH_TOKEN
  const auth = sid && token ? 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') : ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = []
  const unsupported: string[] = []
  let images = 0, pdfs = 0

  for (const m of media) {
    const isImage = IMAGE_TYPES.includes(m.contentType.toLowerCase())
    const isPdf = m.contentType.toLowerCase() === PDF_TYPE
    if (!isImage && !isPdf) { unsupported.push(m.contentType || 'archivo'); continue }

    try {
      const res = await fetch(m.url, auth ? { headers: { Authorization: auth } } : undefined)
      if (!res.ok) { unsupported.push(m.contentType); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_BYTES) { unsupported.push(`${m.contentType} (muy grande)`); continue }
      const data = buf.toString('base64')

      if (isImage) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: m.contentType.toLowerCase(), data } })
        images++
      } else {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: PDF_TYPE, data } })
        pdfs++
      }
    } catch {
      unsupported.push(m.contentType || 'archivo')
    }
  }

  const parts: string[] = []
  if (images) parts.push(images === 1 ? 'una imagen' : `${images} imágenes`)
  if (pdfs) parts.push(pdfs === 1 ? 'un PDF' : `${pdfs} PDFs`)

  let note = ''
  if (parts.length) note = `📎 (el estudiante adjuntó ${parts.join(' y ')})`
  else if (unsupported.length) {
    // No hay bloques legibles: la nota NO puede quedar vacía, si no el turno del
    // usuario iría en blanco. Sofía debe poder decir que no puede abrirlo.
    note = 'El estudiante envió un archivo que no puedo interpretar (por ejemplo audio, video u otro formato). Dile con amabilidad que no puedes abrir ese tipo de archivo y pídele que te escriba el contenido o te mande una foto/PDF.'
  }

  return { blocks, note, unsupported }
}

function userContentWithMedia(text: string, blocks: unknown[]): Anthropic.MessageParam['content'] {
  const clean = (text ?? '').trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  if (clean) out.push({ type: 'text', text: clean })
  out.push(...blocks)
  // Si no había texto, una instrucción mínima para que el modelo actúe sobre el archivo.
  if (!clean) out.unshift({ type: 'text', text: 'El estudiante envió el siguiente archivo sin texto. Interprétalo y responde según lo que muestre.' })
  return out
}

// Devuelve una copia de los mensajes con la media inyectada SÓLO en el último
// mensaje del usuario (el turno actual). El historial se conserva como texto:
// reenviar el base64 en cada turno sería caro e innecesario.
export function messagesWithMedia(
  msgs: Anthropic.MessageParam[],
  media: MediaResult | null,
): Anthropic.MessageParam[] {
  if (!media || !media.blocks.length) return msgs
  const copy = msgs.map(m => ({ ...m }))
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role === 'user') {
      const t = typeof copy[i].content === 'string' ? (copy[i].content as string) : ''
      copy[i].content = userContentWithMedia(t, media.blocks)
      break
    }
  }
  return copy
}
