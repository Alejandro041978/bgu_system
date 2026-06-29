import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { code } = await req.json() as { code: string }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  const supabase = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: instance } = await (supabase as any)
    .from('contract_instances')
    .select('id, status, token_expires_at, signer_name, signer_email, rendered_body')
    .eq('token', token)
    .single()

  if (!instance) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  if (instance.status === 'signed') return NextResponse.json({ error: 'Ya firmado' }, { status: 400 })
  if (new Date(instance.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'El enlace ha expirado' }, { status: 400 })
  }

  // Verificar OTP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: otp } = await (supabase as any)
    .from('contract_otp')
    .select('id, expires_at, used')
    .eq('contract_instance_id', instance.id)
    .eq('code', code)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!otp) return NextResponse.json({ error: 'Código incorrecto' }, { status: 400 })
  if (new Date(otp.expires_at) < new Date()) {
    return NextResponse.json({ error: 'El código ha expirado, solicita uno nuevo' }, { status: 400 })
  }

  const signedAt = new Date()

  // Marcar OTP como usado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('contract_otp').update({ used: true }).eq('id', otp.id)

  // Registrar firma
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('contract_instances')
    .update({
      status: 'signed',
      signed_at: signedAt.toISOString(),
      ip_address: ip,
      user_agent: userAgent,
    })
    .eq('id', instance.id)

  const signedAtStr = signedAt.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Email de confirmación al firmante
  await resend.emails.send({
    from: 'noreply@ibeqa.org',
    to: instance.signer_email,
    subject: 'Confirmación de firma de documento',
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
              <tr>
                <td style="background:#16a34a;padding:28px 40px;">
                  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">✓ Documento firmado</h1>
                  <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">Tu firma ha sido registrada exitosamente</p>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 40px;">
                  <p style="margin:0 0 20px;color:#374151;font-size:15px;">
                    Hola <strong>${instance.signer_name}</strong>,
                  </p>
                  <p style="margin:0 0 24px;color:#374151;font-size:15px;">
                    Este correo confirma que firmaste el documento el <strong>${signedAtStr}</strong>.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <p style="margin:0 0 6px;font-size:12px;color:#16a34a;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Evidencia de firma</p>
                        <p style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>Firmante:</strong> ${instance.signer_name}</p>
                        <p style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>Correo:</strong> ${instance.signer_email}</p>
                        <p style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>Fecha y hora:</strong> ${signedAtStr} (Lima, PE)</p>
                        <p style="margin:0;font-size:13px;color:#374151;"><strong>IP registrada:</strong> ${ip}</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    Guarda este correo como comprobante. Si tienes alguna duda, contacta a tu empleador.
                  </p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  })

  return NextResponse.json({ ok: true })
}
