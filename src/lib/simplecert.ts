// Cliente mínimo de la API de SimpleCert (https://app.simplecert.net/api).
// Auth por header `api-key`. Se emite un certificado creando un "recipient"
// dentro de un Project (plantilla) y se devuelve la URL del PDF generado.
// El API key vive SOLO en env (Vercel): SIMPLECERT_API_KEY. Nunca en el repo.

const BASE = process.env.SIMPLECERT_BASE_URL || 'https://app.simplecert.net/api'

export interface EmitInput {
  projectId: string
  firstName: string
  lastName: string
  email: string
  // Merge tags personalizados: la clave debe coincidir con el merge tag en la plantilla SimpleCert.
  fields?: Record<string, string | null | undefined>
}

export interface EmitResult {
  ok: boolean
  certificateUrl?: string
  error?: string
}

// Crea el recipient (genera el certificado) sin enviar correo desde SimpleCert.
export async function emitCertificate(input: EmitInput): Promise<EmitResult> {
  const apiKey = process.env.SIMPLECERT_API_KEY
  if (!apiKey) return { ok: false, error: 'Falta SIMPLECERT_API_KEY en el servidor.' }
  if (!input.projectId) return { ok: false, error: 'El tipo de documento no tiene SimpleCert Project ID configurado.' }

  // SimpleCert valida formato de correo; usamos un fallback institucional si el estudiante no tiene.
  const email = input.email && /.+@.+\..+/.test(input.email) ? input.email : 'registros@blackwell.university'

  const body: Record<string, string> = {
    FIRST_NAME: (input.firstName || '').trim() || '—',
    LAST_NAME: (input.lastName || '').trim() || '—',
    EMAIL_ADDRESS: email,
    dont_send_email: 'true', // la entrega la controla el ERP, no SimpleCert
  }
  for (const [k, v] of Object.entries(input.fields ?? {})) {
    if (v != null && v !== '') body[k] = String(v)
  }

  let res: Response
  try {
    res = await fetch(`${BASE}/projects/${encodeURIComponent(input.projectId)}/recipient/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar con SimpleCert: ' + (e as Error).message }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errs = (data as any)?.errors
    const msg = Array.isArray(errs) ? errs.join('; ') : (data as { message?: string })?.message
    return { ok: false, error: msg || `SimpleCert respondió ${res.status}` }
  }

  const certificateUrl = (data as { certificate_url?: string })?.certificate_url
  if (!certificateUrl) return { ok: false, error: 'SimpleCert no devolvió certificate_url.' }
  return { ok: true, certificateUrl }
}
