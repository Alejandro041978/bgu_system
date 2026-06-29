import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

// POST: genera y envía código OTP
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: instance } = await (supabase as any)
    .from('contract_instances')
    .select('id, signer_name, signer_email, status, token_expires_at')
    .eq('token', token)
    .single()

  if (!instance) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  if (instance.status === 'signed') return NextResponse.json({ error: 'Este contrato ya fue firmado' }, { status: 400 })
  if (new Date(instance.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'El enlace ha expirado' }, { status: 400 })
  }

  // Invalidar OTPs anteriores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('contract_otp')
    .update({ used: true })
    .eq('contract_instance_id', instance.id)
    .eq('used', false)

  // Generar código de 6 dígitos
  const code = String(Math.floor(100000 + Math.random() * 900000))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('contract_otp')
    .insert({
      contract_instance_id: instance.id,
      code,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: instance.signer_email,
    subject: `Tu código de firma: ${code}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr><td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
              <tr>
                <td style="background:#1e40af;padding:28px 40px;">
                  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Código de verificación</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;text-align:center;">
                  <p style="margin:0 0 24px;color:#374151;font-size:15px;">
                    Hola <strong>${instance.signer_name}</strong>, ingresa este código para confirmar tu firma:
                  </p>
                  <div style="background:#f0f4ff;border:2px dashed #93c5fd;border-radius:12px;padding:24px;margin:0 auto 24px;display:inline-block;">
                    <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1e40af;font-family:monospace;">${code}</span>
                  </div>
                  <p style="margin:0;color:#9ca3af;font-size:12px;">Este código expira en 10 minutos.</p>
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
