import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { employee_id } = await req.json() as { employee_id: string }
    const supabase = supabaseAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emp } = await (supabase as any)
      .from('hr_employees')
      .select('id, full_name, email, user_id')
      .eq('id', employee_id)
      .single()

    if (!emp) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })

    // Si no tiene cuenta aún, crearla primero
    let authUserId: string | null = emp.user_id ?? null
    if (!authUserId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: emp.email,
        user_metadata: { full_name: emp.full_name },
        email_confirm: false,
      })
      if (createErr && !createErr.message?.includes('already been registered')) {
        return NextResponse.json({ error: createErr.message }, { status: 500 })
      }
      if (createErr?.message?.includes('already been registered')) {
        const { data: users } = await supabase.auth.admin.listUsers()
        authUserId = users.users.find(u => u.email === emp.email)?.id ?? null
      } else {
        authUserId = created.user?.id ?? null
      }
      if (authUserId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('hr_employees').update({ user_id: authUserId }).eq('id', employee_id)
      }
    }

    if (!authUserId) return NextResponse.json({ error: 'No se pudo crear la cuenta de acceso' }, { status: 500 })

    // Check if user already has a confirmed email — use magiclink instead of invite
    const { data: authUser } = await supabase.auth.admin.getUserById(authUserId)
    const linkType = authUser?.user?.email_confirmed_at ? 'magiclink' : 'invite'

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: linkType,
      email: emp.email,
      options: { redirectTo: `${appUrl()}/dashboard` },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('generateLink error:', linkError)
      return NextResponse.json({ error: linkError?.message ?? 'Error generando enlace' }, { status: 500 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY!)
    const firstName = emp.full_name.split(' ')[0]
    const magicLink = linkData.properties.action_link

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: emp.email,
      subject: 'Tu acceso al sistema BGU ERP',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1d4ed8, #2563eb); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">BGU ERP</h1>
      <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Sistema Empresarial Blackwell Global University</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #111827; font-size: 16px; margin: 0 0 8px;">Hola, <strong>${firstName}</strong> 👋</p>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
        Se ha creado tu cuenta en el sistema BGU ERP. Usa el siguiente enlace para ingresar — no necesitas contraseña.
      </p>
      <a href="${magicLink}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
        Ingresar al sistema →
      </a>
      <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.6;">
        Este enlace es válido por 24 horas y es de uso único.<br>
        Si no esperabas este correo, puedes ignorarlo.
      </p>
    </div>
    <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #f3f4f6;">
      <p style="color: #d1d5db; font-size: 11px; margin: 0;">© Blackwell Global University · BGU ERP</p>
    </div>
  </div>
</body>
</html>`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('resend-invite error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
