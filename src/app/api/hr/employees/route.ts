import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendInviteEmail(to: string, fullName: string, magicLink: string) {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const firstName = fullName.split(' ')[0]

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
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
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json() as {
      full_name: string
      email: string
      phone?: string
      position?: string
      employee_type: 'direct' | 'contractor' | 'external'
      document_type?: string
      document_number?: string
      birth_date?: string
      address?: string
      notes?: string
      send_invite: boolean
      zoho_agent_id?: string
      zoho_agent_email?: string
    }

    const supabase = supabaseAdmin()
    let authUserId: string | null = null

    if (body.send_invite) {
      // 1. Crear usuario en Auth (sin enviar email de Supabase)
      const { data: userData, error: createError } = await supabase.auth.admin.createUser({
        email: body.email,
        user_metadata: { full_name: body.full_name },
        email_confirm: false,
      })

      if (createError && !createError.message?.includes('already been registered')) {
        throw new Error(createError.message)
      }

      // Si ya existe, obtener su ID
      if (createError?.message?.includes('already been registered')) {
        const { data: users } = await supabase.auth.admin.listUsers()
        const existing = users.users.find(u => u.email === body.email)
        authUserId = existing?.id ?? null
      } else {
        authUserId = userData.user?.id ?? null
      }

      // 2. Generar magic link de invitación
      if (authUserId) {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'invite',
          email: body.email,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          },
        })

        if (!linkError && linkData?.properties?.action_link) {
          // 3. Enviar email con Resend (control total del diseño)
          await sendInviteEmail(body.email, body.full_name, linkData.properties.action_link)
        }
      }
    }

    // Guardar en hr_employees
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertData: Record<string, any> = {
      full_name: body.full_name,
      email: body.email,
      employee_type: body.employee_type,
    }
    if (body.phone) insertData.phone = body.phone
    if (body.position) insertData.position = body.position
    if (body.document_type) insertData.document_type = body.document_type
    if (body.document_number) insertData.document_number = body.document_number
    if (body.birth_date) insertData.birth_date = body.birth_date
    if (body.address) insertData.address = body.address
    if (body.notes) insertData.notes = body.notes
    if (authUserId) insertData.user_id = authUserId
    if (body.zoho_agent_id) insertData.zoho_agent_id = body.zoho_agent_id
    if (body.zoho_agent_email) insertData.zoho_agent_email = body.zoho_agent_email

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('hr_employees')
      .insert(insertData)
      .select('id')
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ id: (data as { id: string }).id, inviteSent: body.send_invite && !!authUserId })
  } catch (err) {
    console.error('HR employee create error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  const supabase = supabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('hr_employees_with_status')
    .select('*')
    .order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
