import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

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

    const tempPassword = generateTempPassword()
    let authUserId: string | null = emp.user_id ?? null

    if (!authUserId) {
      // Crear cuenta nueva
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: emp.email,
        password: tempPassword,
        user_metadata: { full_name: emp.full_name },
        email_confirm: true,
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

    // Actualizar contraseña temporal y confirmar email
    if (authUserId) {
      await supabase.auth.admin.updateUserById(authUserId, { password: tempPassword, email_confirm: true })
    }

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'
    const firstName = emp.full_name.split(' ')[0]
    const resend = new Resend(process.env.RESEND_API_KEY!)

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
        Aquí están tus credenciales de acceso al sistema BGU ERP:
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">Correo electrónico</p>
        <p style="margin: 0 0 16px; font-size: 15px; font-weight: 600; color: #1e293b;">${emp.email}</p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">Contraseña temporal</p>
        <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1d4ed8; letter-spacing: 2px; font-family: monospace;">${tempPassword}</p>
      </div>
      <a href="${loginUrl}/login" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
        Ir al sistema →
      </a>
      <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.6;">
        Te recomendamos cambiar tu contraseña después de ingresar por primera vez.<br>
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
