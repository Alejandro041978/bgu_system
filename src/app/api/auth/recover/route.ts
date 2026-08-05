import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Recuperación de contraseña por NUESTRO canal de correo.
//
// Antes la mandaba Supabase con su propio SMTP. Ese camino no se ve, no se
// registra y no se puede depurar: el 05-08 hubo 48 solicitudes en un día y
// nadie podía decir si habían salido, desde qué remitente ni si alguna rebotó.
// Mientras tanto el ERP entregaba el 100% de sus correos por Resend desde
// blackwell.university —portal, campus, reseteo de correo—, todos con acuse.
//
// generateLink produce el enlace de recuperación SIN enviar nada, así que el
// correo lo componemos y lo mandamos nosotros: mismo remitente verificado que
// el resto, misma plantilla, y cada envío queda con su acuse en Resend.
//
// Nunca revela si el correo existe: responde igual en todos los casos. Saber
// qué direcciones tienen cuenta es media suplantación hecha.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { email?: string } | null
  const email = String(b?.email ?? '').trim().toLowerCase()
  const ok = NextResponse.json({ ok: true })
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'Escribe un correo válido' }, { status: 400 })
  }

  const sb = db()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  // Freno de abuso. Supabase traía el suyo y al salirnos de su envío lo
  // perdimos: sin esto, cualquiera puede llenar el buzón de otro pulsando el
  // enlace en bucle. Se apoya en el registro de accesos que ya existe.
  if (ip) {
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await sb.from('api_access_log')
      .select('id', { count: 'exact', head: true })
      .eq('ruta', '/api/auth/recover').eq('ip', ip).gte('at', desde)
    if ((count ?? 0) >= 5) return ok   // callado: al abusador no se le informa
  }
  await sb.from('api_access_log').insert({
    ruta: '/api/auth/recover', metodo: 'POST', ip,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  }).then(() => null, () => null)

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${base}/auth/callback?next=/update-password` },
  })
  // Correo sin cuenta: se responde ok igual. Es el caso normal de quien se
  // equivoca de dirección, y no hay nada que contarle a quien está probando.
  if (error || !data?.properties?.action_link) return ok

  const enlace = String(data.properties.action_link)
  const nombre = String(data.user?.user_metadata?.full_name ?? '').split(' ')[0] || ''

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error('recover: faltan RESEND_API_KEY o RESEND_FROM_EMAIL')
    return ok
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  // resend.emails.send NO lanza: devuelve { data, error }. Sin mirar ese error
  // el fallo sería exactamente el que estamos arreglando, con otro disfraz.
  const { error: mailErr } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: 'Restablece tu contraseña · BGU ERP',
    html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1d4ed8, #2563eb); padding: 28px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 700;">Blackwell Global University</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #111827; font-size: 16px; margin: 0 0 8px;">Hola${nombre ? `, <strong>${nombre}</strong>` : ''}</p>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Recibimos una solicitud para restablecer la contraseña de <strong>${email}</strong>.
        Pulsa el botón para elegir una nueva. El enlace caduca en una hora.
      </p>
      <a href="${enlace}" style="display: block; background: #2563eb; color: #fff; text-align: center; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
        Restablecer mi contraseña
      </a>
      <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin: 0;">
        Si no pediste esto, puedes ignorar este correo: tu contraseña no cambia hasta que uses el enlace.
      </p>
    </div>
    <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #f3f4f6;">
      <p style="color: #d1d5db; font-size: 11px; margin: 0;">© Blackwell Global University · BGU ERP</p>
    </div>
  </div>
</div>`,
  })
  if (mailErr) console.error('recover: Resend rechazó el envío a', email, mailErr)
  return ok
}
