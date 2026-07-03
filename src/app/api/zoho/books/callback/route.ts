import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">❌ Error en autorización</h2>
        <p>${error ?? 'No se recibió código de autorización'}</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Exchange code for tokens
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'}/api/zoho/books/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const data = await res.json() as { access_token?: string; refresh_token?: string; error?: string }

  if (!data.refresh_token) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">❌ No se obtuvo refresh_token</h2>
        <pre style="background:#f3f4f6;padding:1rem;border-radius:0.5rem">${JSON.stringify(data, null, 2)}</pre>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Save to Supabase app_settings table (key-value store)
  await supabaseAdmin.from('app_settings').upsert({
    key: 'zoho_books_refresh_token',
    value: data.refresh_token,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  return new NextResponse(`
    <html><body style="font-family:sans-serif;padding:2rem">
      <h2 style="color:#16a34a">✅ Zoho Books conectado correctamente</h2>
      <p>El refresh token fue guardado. Ya puedes cerrar esta ventana y recargar la página de Contabilidad.</p>
      <p style="margin-top:1rem">
        <a href="/finance" style="background:#4f46e5;color:white;padding:0.5rem 1rem;border-radius:0.5rem;text-decoration:none">
          Ir a Contabilidad →
        </a>
      </p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
