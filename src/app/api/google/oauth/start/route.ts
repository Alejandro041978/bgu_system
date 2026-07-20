import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// Autorización única: visitar logueado en el ERP, con la sesión de Google de
// la cuenta dedicada (automatizacion@blackwell.pro). Devuelve el refresh token
// para pegarlo en Vercel como GOOGLE_OAUTH_REFRESH_TOKEN.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado: inicia sesión en el ERP primero' }, { status: 401 })
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.json({ error: 'Falta GOOGLE_OAUTH_CLIENT_ID en Vercel' }, { status: 500 })
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: 'https://system.blackwell.university/api/google/oauth/callback',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/admin.directory.user',
    access_type: 'offline',
    prompt: 'consent',
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
