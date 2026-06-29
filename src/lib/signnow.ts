const BASE = 'https://api.signnow.com'

async function getToken(): Promise<string> {
  const b64 = Buffer.from(
    `${process.env.SIGNNOW_CLIENT_ID}:${process.env.SIGNNOW_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${b64}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: process.env.SIGNNOW_USERNAME!,
      password: process.env.SIGNNOW_PASSWORD!,
      scope: '*',
    }),
  })
  const data = await res.json() as { access_token: string; error?: string }
  if (!res.ok || !data.access_token) throw new Error(data.error ?? 'SignNow auth failed')
  return data.access_token
}

// Sube un PDF desde URL pública y devuelve el document_id de SignNow
export async function uploadDocumentFromUrl(pdfUrl: string, fileName: string): Promise<string> {
  const token = await getToken()

  // Descargar el PDF
  const pdfRes = await fetch(pdfUrl)
  if (!pdfRes.ok) throw new Error('No se pudo descargar el PDF del contrato')
  const pdfBuffer = await pdfRes.arrayBuffer()

  const form = new FormData()
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName)

  const res = await fetch(`${BASE}/document`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form,
  })
  const data = await res.json() as { id?: string; error?: string }
  if (!res.ok || !data.id) throw new Error(JSON.stringify(data))
  return data.id
}

// Envía un documento a firma por email
export async function sendForSignature(params: {
  documentId: string
  signerEmail: string
  signerName: string
  subject: string
  message: string
}): Promise<string> {
  const token = await getToken()

  const body = {
    to: [
      {
        email: params.signerEmail,
        role: 'Signer',
        order: 1,
      },
    ],
    from: process.env.SIGNNOW_USERNAME,
    subject: params.subject,
    message: params.message,
  }

  const res = await fetch(`${BASE}/document/${params.documentId}/invite`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json() as { status?: string; id?: string; error?: string }
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data.id ?? 'sent'
}

// Obtiene el estado de un documento
export async function getDocumentStatus(documentId: string): Promise<{
  status: string
  signers: { email: string; status: string }[]
}> {
  const token = await getToken()
  const res = await fetch(`${BASE}/document/${documentId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const data = await res.json() as {
    status?: string
    field_invites?: { email: string; status: string }[]
    error?: string
  }
  if (!res.ok) throw new Error(JSON.stringify(data))
  return {
    status: data.status ?? 'unknown',
    signers: data.field_invites ?? [],
  }
}

// Descarga el PDF firmado como buffer
export async function downloadSignedDocument(documentId: string): Promise<ArrayBuffer> {
  const token = await getToken()
  const res = await fetch(`${BASE}/document/${documentId}/download?type=collapsed`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error descargando documento firmado')
  return res.arrayBuffer()
}
