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

// Países hispanohablantes (ISO-3) → plantilla en español; el resto en inglés
const ES_COUNTRIES = new Set(['PER', 'ECU', 'MEX', 'COL', 'CHL', 'ARG', 'BOL', 'CRI', 'CUB', 'DOM', 'SLV', 'ESP', 'GTM', 'HND', 'NIC', 'PAN', 'PRY', 'URY', 'VEN', 'PRI'])
export const langFor = (country: string | null | undefined): 'es' | 'en' =>
  !country || ES_COUNTRIES.has(country.toUpperCase()) ? 'es' : 'en'

const T = {
  es: {
    subject: 'Importante: tu correo universitario de Blackwell University',
    banner: 'Importante',
    title: 'Activando mi correo Universitario',
    intro: 'Con la finalidad de aportar en tu proceso de aprendizaje hemos creado para ti un correo universitario, con todas las herramientas y soporte tecnológico de Google.',
    credsTitle: 'Tus credenciales para el primer acceso',
    access: 'Acceder al correo', mail: 'Correo', pass: 'Contraseña',
    gsuite: '¡Recuerda que tienes acceso gratuito a Google Workspace for Education!',
    dear: (n: string) => `Estimado/a ${n}, por favor almacena esta información en un lugar seguro. En tu primer ingreso el sistema te pedirá cambiar la contraseña.`,
    sign: 'Atentamente,', team: 'Equipo de Blackwell Global University',
    cta: 'Ingresar',
  },
  en: {
    subject: 'Important: your Blackwell University student email',
    banner: 'Important',
    title: 'Activating my University email',
    intro: 'To support your learning journey, we have created a university email account for you, with all the tools and technology support of Google.',
    credsTitle: 'Your credentials for first access',
    access: 'Email portal', mail: 'Email', pass: 'Password',
    gsuite: 'Remember: you have free access to Google Workspace for Education!',
    dear: (n: string) => `Dear ${n}, please store this information in a safe place. On your first sign-in, the system will ask you to change your password.`,
    sign: 'Sincerely,', team: 'Blackwell Global University Team',
    cta: 'Sign in',
  },
}

const PORTAL = 'https://email.blackwell.pro/'

function emailHtml(lang: 'es' | 'en', studentName: string, created: EmailCreation): string {
  const t = T[lang]
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
  <tr>
    <td style="background:#0f2a5f;background-image:linear-gradient(105deg,#0f2a5f 55%,#1d4ed8 55%);padding:34px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px">Blackwell<br/>University</td>
        <td align="right" style="color:#ffffff;font-size:30px;font-weight:bold">${t.banner}</td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px 8px" align="center">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#0f2a5f;font-weight:bold">${t.title}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 48px;color:#374151;font-size:14px;line-height:1.6" align="center">${t.intro}</td>
  </tr>
  <tr>
    <td style="padding:8px 48px" align="center">
      <div style="font-size:14px;color:#0f2a5f;font-weight:bold;margin-bottom:12px">${t.credsTitle}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%">
        <tr><td style="padding:6px 18px 2px;color:#1d4ed8;font-size:13px"><b style="color:#0f2a5f">${t.access}:</b> <a href="${PORTAL}" style="color:#1d4ed8">email.blackwell.pro</a></td></tr>
        <tr><td style="padding:2px 18px;color:#1d4ed8;font-size:13px"><b style="color:#0f2a5f">${t.mail}:</b> ${created.email}</td></tr>
        <tr><td style="padding:2px 18px 10px;color:#6b7280;font-size:13px"><b style="color:#0f2a5f">${t.pass}:</b> <span style="font-family:monospace">${created.password}</span></td></tr>
      </table>
    </td>
  </tr>
  <tr><td style="padding:18px 48px 4px;color:#6b7280;font-size:12px" align="center">${t.gsuite}</td></tr>
  <tr><td style="padding:12px 48px;color:#374151;font-size:13px;line-height:1.6" align="center">${t.dear(studentName)}</td></tr>
  <tr><td style="padding:8px 48px 4px;color:#374151;font-size:13px" align="center">${t.sign}<br/><b>${t.team}</b></td></tr>
  <tr>
    <td style="padding:22px 48px 34px" align="center">
      <a href="${PORTAL}" style="background:#0f2a5f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 38px;border-radius:4px;display:inline-block">${t.cta} ➔</a>
    </td>
  </tr>
  <tr>
    <td style="background:#0f2a5f;padding:14px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="color:#cbd5e1;font-size:11px"><a href="mailto:helpdesk@blackwell.university" style="color:#cbd5e1;text-decoration:none">helpdesk@blackwell.university</a></td>
        <td align="right" style="color:#cbd5e1;font-size:11px">www.<b style="color:#ffffff">blackwell</b>.university</td>
      </tr></table>
    </td>
  </tr>
</table>
</td></tr></table>`
}

// Notificación al correo personal vía Resend (idioma según país del estudiante)
export async function notifyStudentEmail(personalEmail: string, studentName: string, created: EmailCreation, lang: 'es' | 'en' = 'es'): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: personalEmail,
    subject: T[lang].subject,
    html: emailHtml(lang, studentName, created),
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
