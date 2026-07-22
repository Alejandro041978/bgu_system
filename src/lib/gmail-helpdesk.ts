// ---------------------------------------------------------------------------
// Lectura de Gmail del buzón de soporte (helpdesk@blackwell.university).
// Misma arquitectura que el correo estudiantil: OAuth con consentimiento único
// de la cuenta + refresh token en Vercel (GMAIL_HELPDESK_REFRESH_TOKEN,
// autorizar en /api/google/oauth/start?scope=gmail con la sesión de helpdesk@).
//
// N8N entrega el sobre del correo (asunto, cuerpo); los ADJUNTOS y las
// imágenes incrustadas se bajan aquí directo de Gmail por el id del mensaje
// (sin límite de tamaño del body de Vercel) y se guardan en Supabase Storage.
// ---------------------------------------------------------------------------

export const INBOX_BUCKET = 'inbox-attachments'

export function gmailHelpdeskConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GMAIL_HELPDESK_REFRESH_TOKEN)
}

async function gmailToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_HELPDESK_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const d = await res.json()
  if (!res.ok || !d.access_token) {
    if (d.error === 'invalid_grant') {
      throw new Error('El refresh token de Gmail (helpdesk) fue revocado o caducó: re-autorizar en /api/google/oauth/start?scope=gmail con la sesión de helpdesk@ y actualizar GMAIL_HELPDESK_REFRESH_TOKEN en Vercel')
    }
    throw new Error(`Google token: ${d.error_description ?? d.error ?? res.status}`)
  }
  return d.access_token
}

// Lista los ids de mensajes del INBOX de los últimos N días (paginado)
export async function listInboxMessageIds(days: number): Promise<string[]> {
  const token = await gmailToken()
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  const ids: string[] = []
  let pageToken = ''
  do {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`in:inbox newer_than:${days}d`)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, auth)
    const d = await res.json()
    if (!res.ok) throw new Error(`Gmail list: ${d.error?.message ?? res.status}`)
    for (const m of d.messages ?? []) ids.push(m.id)
    pageToken = d.nextPageToken ?? ''
  } while (pageToken && ids.length < 1000)
  return ids
}

// Mensaje completo (headers + payload multipart)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGmailMessageFull(id: string): Promise<any> {
  const token = await gmailToken()
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } })
  const d = await res.json()
  if (!res.ok) throw new Error(`Gmail get: ${d.error?.message ?? res.status}`)
  return d
}

export interface GmailPart {
  filename: string
  mimeType: string
  contentId: string | null
  attachmentId: string
  size: number
}

// Recorre el árbol multipart del mensaje y devuelve todo lo descargable:
// adjuntos con nombre y también imágenes inline (con Content-ID, a veces sin
// nombre de archivo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkParts(payload: any, out: GmailPart[] = []): GmailPart[] {
  if (!payload) return out
  const attachmentId = payload.body?.attachmentId
  if (attachmentId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (payload.headers ?? []) as any[]
    const cidRaw = headers.find(h => (h.name ?? '').toLowerCase() === 'content-id')?.value ?? null
    out.push({
      filename: payload.filename || '',
      mimeType: payload.mimeType ?? 'application/octet-stream',
      contentId: cidRaw ? String(cidRaw).replace(/^<|>$/g, '') : null,
      attachmentId,
      size: Number(payload.body?.size ?? 0),
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (payload.parts ?? []) as any[]) walkParts(p, out)
  return out
}

const b64urlToBuffer = (data: string): Buffer =>
  Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

// Baja de Gmail los adjuntos del mensaje y los guarda en Storage + wa_attachments.
// Best-effort por archivo. Devuelve cuántos guardó.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importEmailAttachments(sb: any, args: {
  gmailId: string; messageDbId: string; conversationId: string
}): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = []
  const token = await gmailToken()
  const auth = { headers: { Authorization: `Bearer ${token}` } }

  const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.gmailId}?format=full`, auth)
  const msg = await msgRes.json()
  if (!msgRes.ok) throw new Error(`Gmail get message: ${msg.error?.message ?? msgRes.status}`)

  const parts = walkParts(msg.payload)
  let saved = 0
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    try {
      const attRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.gmailId}/attachments/${part.attachmentId}`, auth)
      const att = await attRes.json()
      if (!attRes.ok || !att.data) throw new Error(att.error?.message ?? `HTTP ${attRes.status}`)
      const buffer = b64urlToBuffer(att.data)

      const ext = part.mimeType.includes('/') ? part.mimeType.split('/')[1].split('+')[0] : 'bin'
      const name = (part.filename || `inline-${i + 1}.${ext}`).replace(/[^\w.\-() ]+/g, '_').slice(0, 120)
      const path = `${args.conversationId}/${args.messageDbId}/${i}-${name}`

      const { error: upErr } = await sb.storage.from(INBOX_BUCKET)
        .upload(path, buffer, { contentType: part.mimeType, upsert: true })
      if (upErr) throw new Error(upErr.message)

      const { error: insErr } = await sb.from('wa_attachments').insert({
        message_id: args.messageDbId,
        conversation_id: args.conversationId,
        filename: part.filename || name,
        mime_type: part.mimeType,
        content_id: part.contentId,
        size_bytes: buffer.length,
        storage_path: path,
      })
      if (insErr) throw new Error(insErr.message)
      saved++
    } catch (e) {
      errors.push(`${part.filename || part.contentId || i}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return { saved, errors }
}
