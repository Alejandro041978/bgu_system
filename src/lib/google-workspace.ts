import { Resend } from 'resend'

// ---------------------------------------------------------------------------
// Correo estudiantil en Google Workspace for Education (@blackwell.pro).
// Arquitectura: OAuth 2.0 con consentimiento único de una cuenta dedicada de
// rol mínimo (solo gestionar usuarios) + refresh_token en Vercel. Sin claves
// perpetuas ni delegación de dominio. Re-autorizar: /api/google/oauth/start
// ---------------------------------------------------------------------------

const DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || 'blackwell.pro'

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN)
}

export async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const d = await res.json()
  if (!res.ok || !d.access_token) {
    if (d.error === 'invalid_grant') {
      throw new Error('El refresh token de Google fue revocado o caducó: re-autorizar en /api/google/oauth/start y actualizar GOOGLE_OAUTH_REFRESH_TOKEN en Vercel')
    }
    throw new Error(`Google token: ${d.error_description ?? d.error ?? res.status}`)
  }
  return d.access_token
}

const strip = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

async function emailExistsInGoogle(token: string, email: string): Promise<boolean> {
  const res = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return false
  if (res.ok) return true
  throw new Error(`Google users.get ${res.status}: ${(await res.json()).error?.message ?? ''}`)
}

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  const buf = crypto.getRandomValues(new Uint8Array(12))
  for (const b of buf) out += chars[b % chars.length]
  return out + '!'
}

export interface EmailCreation { email: string; password: string }

// Crea la cuenta con la convención nombre.apellido@dominio, resolviendo
// colisiones contra Google y contra los alias que le pasemos como ocupados.
export async function createStudentEmail(
  student: { first_name: string | null; last_name: string | null; second_last_name?: string | null },
  takenLocally: Set<string>,
): Promise<EmailCreation> {
  if (!googleConfigured()) throw new Error('Faltan GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN en Vercel')
  const first = strip((student.first_name ?? '').trim().split(/\s+/)[0])
  const last = strip((student.last_name ?? '').trim().split(/\s+/)[0])
  if (!first || !last) throw new Error('El estudiante no tiene nombre y apellido válidos para generar el alias')
  const secondInitial = strip((student.second_last_name ?? '').trim().split(/\s+/)[0]).slice(0, 1)

  const candidates = [
    `${first}.${last}`,
    ...(secondInitial ? [`${first}.${last}${secondInitial}`] : []),
    ...[2, 3, 4, 5, 6, 7, 8, 9].map(n => `${first}.${last}${n}`),
  ]

  const token = await getAccessToken()
  let chosen: string | null = null
  for (const c of candidates) {
    const email = `${c}@${DOMAIN}`
    if (takenLocally.has(email)) continue
    if (await emailExistsInGoogle(token, email)) continue
    chosen = email
    break
  }
  if (!chosen) throw new Error('No se encontró un alias libre (agotados los candidatos)')

  const password = tempPassword()
  const res = await fetch('https://admin.googleapis.com/admin/directory/v1/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primaryEmail: chosen,
      name: {
        givenName: (student.first_name ?? '').trim() || 'Estudiante',
        familyName: [student.last_name, student.second_last_name].filter(Boolean).join(' ').trim() || 'BGU',
      },
      password,
      changePasswordAtNextLogin: true,
    }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(`Google users.insert ${res.status}: ${d.error?.message ?? 'error'}`)
  }
  return { email: chosen, password }
}

// Notificación al correo personal vía Resend
export async function notifyStudentEmail(personalEmail: string, studentName: string, created: EmailCreation): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: personalEmail,
    subject: 'Tu correo estudiantil de Blackwell University',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <h2 style="color:#1e3a8a">¡Bienvenido(a), ${studentName}!</h2>
        <p>Hemos creado tu correo estudiantil institucional:</p>
        <p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;font-size:16px">
          <b>Correo:</b> ${created.email}<br/>
          <b>Contraseña temporal:</b> ${created.password}
        </p>
        <p>Ingresa en <a href="https://accounts.google.com">accounts.google.com</a> con estas credenciales.
        El sistema te pedirá <b>cambiar la contraseña</b> en el primer inicio de sesión.</p>
        <p>Este correo te da acceso a los servicios de Google Education de la universidad y será
        nuestro canal oficial de comunicación académica.</p>
        <p style="color:#6b7280;font-size:12px">Blackwell University · Registrar's Office</p>
      </div>`,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
