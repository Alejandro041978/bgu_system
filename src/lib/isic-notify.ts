import { Resend } from 'resend'

// Aviso al estudiante de que su carné internacional está emitido.
//
// ISIC NO manda ningún correo: darle de alta en la CCDB no le avisa a nadie.
// Sin este mensaje el carné existe y el estudiante no lo sabe.
//
// Y hay una trampa que este correo tiene que desarmar: el enlace de activación
// es un DEEP LINK a la app de ISIC, no una página. Abierto en una computadora
// solo muestra "descarga la app"; y quien descarga la app por su cuenta, sin
// pasar por el enlace, se encuentra una pantalla de login sin credenciales —
// porque no hay credenciales que darle: la cuenta nace al abrir el enlace con
// la app ya instalada. Por eso el correo insiste en el orden y en el teléfono.
export interface IsicNotifyInput {
  to: string
  firstName: string
  cardNumber: string
  registrationUrl: string | null
  validTo: string
}

export async function notifyIsicCard(i: IsicNotifyInput): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { ok: false, error: 'Resend sin configurar' }
  }
  if (!i.to) return { ok: false, error: 'El estudiante no tiene correo' }

  const vence = new Date(i.validTo + 'T12:00:00')
    .toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

  const boton = i.registrationUrl
    ? `<a href="${i.registrationUrl}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin:0 0 8px;">
         Activar mi carné en la app →
       </a>
       <p style="color:#9ca3af;font-size:12px;margin:0 0 24px;text-align:center;">
         Este botón abre la app de ISIC. Si la abres en una computadora solo verás la página de descarga.
       </p>`
    : `<p style="color:#b45309;font-size:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin:0 0 24px;">
         Estamos generando tu enlace de activación. Escríbenos y te lo enviamos.
       </p>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: i.to,
      subject: 'Tu carné internacional de estudiante (ISIC) ya está emitido',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1a34a8, #2563eb); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Carné Internacional de Estudiante</h1>
      <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Blackwell Global University · ISIC</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #111827; font-size: 16px; margin: 0 0 8px;">Hola, <strong>${i.firstName}</strong> 👋</p>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
        Tu carné ISIC ya está emitido. <strong>Es un carné digital</strong>: vive en la app de ISIC, no es un archivo que
        se descargue. Con él accedes a descuentos para estudiantes en más de 130 países.
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 24px;">
        <p style="color:#6b7280;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px;">Número de carné</p>
        <p style="color:#111827;font-size:20px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:0 0 12px;letter-spacing:1px;">${i.cardNumber}</p>
        <p style="color:#6b7280;font-size:13px;margin:0;">Válido hasta el <strong style="color:#111827;">${vence}</strong></p>
      </div>

      <p style="color:#111827;font-size:15px;font-weight:600;margin:0 0 10px;">Cómo activarlo — hazlo desde tu teléfono</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
        <tr>
          <td style="vertical-align:top;padding:0 10px 12px 0;width:26px;">
            <span style="display:inline-block;width:22px;height:22px;background:#2563eb;color:white;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;">1</span>
          </td>
          <td style="color:#4b5563;font-size:14px;line-height:1.55;padding:0 0 12px;">
            <strong style="color:#111827;">Abre este correo en tu teléfono</strong> y instala la app <strong>ISIC</strong>
            desde la App Store o Google Play.
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:0 10px 12px 0;width:26px;">
            <span style="display:inline-block;width:22px;height:22px;background:#2563eb;color:white;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;">2</span>
          </td>
          <td style="color:#4b5563;font-size:14px;line-height:1.55;padding:0 0 12px;">
            <strong style="color:#111827;">Con la app ya instalada</strong>, vuelve aquí y toca el botón de abajo. La app se
            abre con tu carné cargado y ahí creas tu contraseña.
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:0 10px 0 0;width:26px;">
            <span style="display:inline-block;width:22px;height:22px;background:#2563eb;color:white;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;">3</span>
          </td>
          <td style="color:#4b5563;font-size:14px;line-height:1.55;">
            Listo: tu carné queda en la app, con tu foto y tu número.
          </td>
        </tr>
      </table>

      ${boton}

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin:0 0 20px;">
        <p style="color:#92400e;font-size:13px;margin:0;line-height:1.55;">
          <strong>Si la app te pide usuario y contraseña, no las busques: no existen todavía.</strong> Significa que
          abriste la app directamente. Cierra la app, vuelve a este correo y toca el botón de arriba: tu cuenta se crea
          en ese momento.
        </p>
      </div>

      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
        ¿Algún problema? Responde a este correo y Registros te ayuda.
      </p>
    </div>
  </div>
</body>
</html>`,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
