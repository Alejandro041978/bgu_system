import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      template_id: string
      signer_name: string
      signer_email: string
      signer_type: string
      signer_ref_id?: string
      field_values: Record<string, string>
    }

    const { template_id, signer_name, signer_email, signer_type, signer_ref_id, field_values } = body

    if (!template_id || !signer_name || !signer_email || !signer_type) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = admin()

    // Obtener plantilla
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: tErr } = await (supabase as any)
      .from('contract_templates')
      .select('*')
      .eq('id', template_id)
      .single()

    if (tErr || !template) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }

    // Renderizar texto con variables
    let rendered_body = template.body as string
    for (const [key, value] of Object.entries(field_values)) {
      rendered_body = rendered_body.replaceAll(`{{${key}}}`, value)
    }

    // Crear instancia del contrato
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: instance, error: iErr } = await (supabase as any)
      .from('contract_instances')
      .insert({
        template_id,
        rendered_body,
        signer_name,
        signer_email,
        signer_type,
        signer_ref_id: signer_ref_id ?? null,
        field_values,
        status: 'pending',
      })
      .select()
      .single()

    if (iErr || !instance) {
      return NextResponse.json({ error: iErr?.message ?? 'Error creando contrato' }, { status: 500 })
    }

    const signUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sign/${instance.token}`

    // Enviar email con el link de firma
    await resend.emails.send({
      from: 'noreply@ibeqa.org',
      to: signer_email,
      subject: `Tienes un contrato pendiente de firma`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"/></head>
        <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                <tr>
                  <td style="background:#1e40af;padding:32px 40px;">
                    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Documento para firma</h1>
                    <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Se requiere tu firma digital</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:36px 40px;">
                    <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hola <strong>${signer_name}</strong>,</p>
                    <p style="margin:0 0 24px;color:#374151;font-size:15px;">
                      Tienes un contrato pendiente de revisión y firma. Haz clic en el botón para leerlo y firmarlo digitalmente.
                    </p>
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                      <tr>
                        <td style="background:#1e40af;border-radius:8px;padding:14px 32px;">
                          <a href="${signUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                            Ver y firmar contrato →
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                      Este enlace es válido por 30 días. Si no eres ${signer_name}, ignora este correo.
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

    return NextResponse.json({ ok: true, instance_id: instance.id, token: instance.token })
  } catch (err) {
    console.error('Error enviando contrato:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
