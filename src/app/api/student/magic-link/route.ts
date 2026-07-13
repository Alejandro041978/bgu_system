import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// POST { email } → genera el enlace de acceso del estudiante en el servidor y lo
// envía por RESEND (no por el correo de Supabase, que fallaba con 500).
export async function POST(req: NextRequest) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string }
  const mail = (email ?? '').trim().toLowerCase()
  if (!mail) return NextResponse.json({ error: 'missing_email' }, { status: 400 })

  const sb = admin()

  // El correo debe pertenecer a un estudiante
  const { data: stu } = await sb.from('academic_students')
    .select('first_name, last_name').eq('email', mail).eq('disabled', false).maybeSingle()
  if (!stu) return NextResponse.json({ error: 'not_student' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'

  // Genera el enlace mágico en el servidor (crea el usuario si no existe).
  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: mail,
    options: { redirectTo: `${appUrl}/auth/callback?next=/student` },
  })
  const props = link?.properties
  if (linkErr || !props?.hashed_token) {
    return NextResponse.json({ error: 'link_failed' }, { status: 500 })
  }
  // Apunta a NUESTRO callback (verifyOtp por token_hash), no al verify de Supabase
  // (cuyo token viaja en el hash y el servidor no puede leer → volvía al login).
  const verType = props.verification_type ?? 'magiclink'
  const actionLink = `${appUrl}/auth/callback?token_hash=${encodeURIComponent(props.hashed_token)}&type=${verType}&next=${encodeURIComponent('/student')}`

  // Envía el enlace por Resend
  const firstName = (stu.first_name ?? '').split(' ')[0] || 'Estudiante'
  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: mail,
      subject: 'Tu enlace de acceso · Portal Estudiantil Blackwell',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1a34a8, #2563eb); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Portal Estudiantil</h1>
      <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Blackwell Global University</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #111827; font-size: 16px; margin: 0 0 8px;">Hola, <strong>${firstName}</strong> 👋</p>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
        Toca el botón para ingresar a tu portal (cronograma, notas, estado de cuenta y documentos). El enlace es válido por 1 hora.
      </p>
      <a href="${actionLink}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
        Ingresar a mi portal →
      </a>
      <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.6;">
        Si no solicitaste este acceso, puedes ignorar este correo.
      </p>
    </div>
    <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #f3f4f6;">
      <p style="color: #d1d5db; font-size: 11px; margin: 0;">© Blackwell Global University</p>
    </div>
  </div>
</body>
</html>`,
    })
  } catch (e) {
    return NextResponse.json({ error: 'send_failed', detail: String(e) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
