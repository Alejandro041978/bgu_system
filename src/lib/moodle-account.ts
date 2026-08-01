// ---------------------------------------------------------------------------
// Cuenta de Moodle del estudiante: creación y reenvío de credenciales.
//
// Antes la cuenta se creaba con createpassword=1, que le pide a Moodle que
// genere la contraseña y la envíe él. Eso pasa en dos tiempos —Moodle deja al
// usuario marcado y una tarea programada envía después— así que si el cron del
// campus no corre o el correo saliente está apagado, el estudiante queda
// creado, sin contraseña y sin aviso, y el ERP no se entera.
//
// Ahora la contraseña la genera el ERP, se la pasa a Moodle en la misma
// llamada junto con "cambiar al primer ingreso", y el aviso lo mandamos
// nosotros. Sabemos qué se envió, a qué dirección y cuándo, y se puede
// reenviar.
//
// LA CONTRASEÑA NO SE GUARDA. Reenviar genera una nueva y la vuelve a poner en
// Moodle: el operador ve lo mismo —el estudiante entra— pero no existe en la
// base un archivo con mil contraseñas legibles, y la que se extravió deja de
// servir, que es lo correcto si el primer correo se perdió.
// ---------------------------------------------------------------------------
import { Resend } from 'resend'
import { moodleCall } from './moodle'

// Con margen sobre cualquier política razonable del campus: 14 caracteres con
// mayúscula, minúscula, dígito y símbolo. Si no cumpliera, Moodle rechaza la
// creación entera y no habría forma de saber por qué.
export function contrasenaDePrimerUso(): string {
  const may = 'ABCDEFGHJKLMNPQRSTUVWXYZ'      // sin I ni O: se confunden al dictarlas
  const min = 'abcdefghijkmnpqrstuvwxyz'      // sin l
  const dig = '23456789'                      // sin 0 ni 1
  const sim = '#$%&*+-?'
  const todo = may + min + dig + sim
  const azar = (s: string) => s[Math.floor(Math.random() * s.length)]
  const base = [azar(may), azar(min), azar(dig), azar(sim)]
  while (base.length < 14) base.push(azar(todo))
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join('')
}

export interface CuentaMoodle { moodle_user_id: number; password: string }

// Crea la cuenta con contraseña de primer uso y cambio obligatorio.
export async function crearCuentaMoodle(u: {
  email: string; firstname: string; lastname: string; idnumber?: string
}): Promise<CuentaMoodle> {
  const password = contrasenaDePrimerUso()
  const created = await moodleCall('core_user_create_users', {
    users: [{
      username: u.email.trim().toLowerCase(),
      email: u.email.trim().toLowerCase(),
      firstname: u.firstname,
      lastname: u.lastname,
      auth: 'manual',
      password,
      // Moodle le exige cambiarla antes de hacer nada. Es lo que convierte a
      // esta contraseña en de un solo uso de verdad, y no sólo de nombre.
      preferences: [{ type: 'auth_forcepasswordchange', value: '1' }],
      ...(u.idnumber ? { idnumber: u.idnumber } : {}),
    }],
  })
  const id = Number(created?.[0]?.id)
  if (!Number.isFinite(id)) throw new Error('Moodle no devolvió el id del usuario creado')
  return { moodle_user_id: id, password }
}

// Reenviar = poner una contraseña nueva. La anterior deja de servir.
export async function renovarContrasenaMoodle(moodleUserId: number): Promise<string> {
  const password = contrasenaDePrimerUso()
  await moodleCall('core_user_update_users', {
    users: [{
      id: moodleUserId,
      password,
      preferences: [{ type: 'auth_forcepasswordchange', value: '1' }],
    }],
  })
  return password
}

const CAMPUS = process.env.NEXT_PUBLIC_MOODLE_URL ?? 'https://campus.blackwell.university'

const TXT = {
  es: {
    subject: 'Tu acceso al Campus Virtual — Blackwell Global University',
    hola: 'Hola',
    intro: 'Ya tienes tu cuenta en el Campus Virtual. Estos son tus datos de acceso:',
    usuario: 'Usuario',
    clave: 'Contraseña temporal',
    aviso: 'Al ingresar por primera vez el sistema te pedirá cambiarla. Elige una que solo tú conozcas.',
    boton: 'Entrar al Campus',
    pie: 'Si no reconoces este mensaje, escríbenos respondiendo a este correo.',
  },
  en: {
    subject: 'Your Virtual Campus access — Blackwell Global University',
    hola: 'Hi',
    intro: 'Your Virtual Campus account is ready. These are your credentials:',
    usuario: 'Username',
    clave: 'Temporary password',
    aviso: 'You will be asked to change it the first time you sign in. Choose one only you know.',
    boton: 'Go to the Campus',
    pie: 'If you don’t recognise this message, just reply to this email.',
  },
}

export async function notificarCuentaMoodle(args: {
  to: string; nombre: string; usuario: string; password: string; lang?: 'es' | 'en'
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY')
  const t = TXT[args.lang ?? 'es']
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <p style="font-size:15px">${t.hola} ${args.nombre},</p>
      <p style="font-size:15px">${t.intro}</p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin:16px 0">
        <tr><td style="padding:12px 16px;font-size:13px;color:#64748b">${t.usuario}</td>
            <td style="padding:12px 16px;font-size:15px;font-weight:600">${args.usuario}</td></tr>
        <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">${t.clave}</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:700;font-family:ui-monospace,monospace;border-top:1px solid #e2e8f0">${args.password}</td></tr>
      </table>
      <p style="font-size:14px;color:#475569">${t.aviso}</p>
      <p style="margin:24px 0">
        <a href="${CAMPUS}" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">${t.boton}</a>
      </p>
      <p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">${t.pie}</p>
    </div>`
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: args.to,
    subject: t.subject,
    html,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
