import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// Autorización única: visitar logueado en el ERP, con la sesión de Google de
// la cuenta a autorizar. Devuelve el refresh token para pegarlo en Vercel.
//   (sin parámetros)  → admin.directory.user con automatizacion@blackwell.pro
//                       → GOOGLE_OAUTH_REFRESH_TOKEN (correo estudiantil)
//   ?scope=gmail      → gmail.readonly con helpdesk@blackwell.university
//                       → GMAIL_HELPDESK_REFRESH_TOKEN (adjuntos del buzón)
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado: inicia sesión en el ERP primero' }, { status: 401 })
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.json({ error: 'Falta GOOGLE_OAUTH_CLIENT_ID en Vercel' }, { status: 500 })
  }
  const scope = req.nextUrl.searchParams.get('scope') === 'gmail'
    ? 'https://www.googleapis.com/auth/gmail.readonly'
    : 'https://www.googleapis.com/auth/admin.directory.user'
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: 'https://system.blackwell.university/api/google/oauth/callback',
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
