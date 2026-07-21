import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

// Log de ingresos al Portal del Estudiante (best-effort: nunca bloquea el login)
async function logStudentLogin(request: NextRequest, email: string | undefined) {
  if (!email) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const mail = email.toLowerCase()
    const { data: stu } = await sb.from('academic_students')
      .select('id').or(`email.eq.${mail},email_alt.eq.${mail}`).limit(1).maybeSingle()
    await sb.from('student_portal_logins').insert({
      student_id: stu?.id ?? null,
      email: mail,
      ip: (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
      user_agent: request.headers.get('user-agent')?.slice(0, 250) ?? null,
    })
  } catch { /* la tabla puede no existir aún */ }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/desk'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  // Enlace generado server-side (Resend): verificación por token_hash.
  if (tokenHash && type) {
    const { error, data } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      if (next.startsWith('/student')) await logStudentLogin(request, data.user?.email)
      return NextResponse.redirect(new URL(next, request.url))
    }
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  // Flujo PKCE (login iniciado en el navegador).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, request.url))
  }

  return NextResponse.redirect(new URL('/login?error=auth', request.url))
}
