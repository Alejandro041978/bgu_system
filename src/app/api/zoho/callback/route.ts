import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI ?? 'https://bgu-system.vercel.app/api/zoho/callback'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state') // 'books' for Books flow
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">❌ Error en autorización Zoho</h2>
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
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const data = await res.json() as { access_token?: string; refresh_token?: string; error?: string }

  if (!data.refresh_token) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">❌ No se obtuvo refresh_token</h2>
        <pre style="background:#f3f4f6;padding:1rem;border-radius:0.5rem;font-size:12px">${JSON.stringify(data, null, 2)}</pre>
        <p style="color:#6b7280;font-size:14px">El cliente Zoho debe tener habilitada la opción "Offline Access" y el scope correcto.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  if (state === 'books') {
    // Save Zoho Books refresh token
    await supabaseAdmin.from('app_settings').upsert({
      key: 'zoho_books_refresh_token',
      value: data.refresh_token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

    return new NextResponse(`
      <html>
      <head><meta charset="utf-8"><title>Zoho Books conectado</title></head>
      <body style="font-family:sans-serif;padding:3rem;text-align:center;max-width:480px;margin:0 auto">
        <div style="font-size:3rem;margin-bottom:1rem">✅</div>
        <h2 style="color:#16a34a;margin-bottom:0.5rem">Zoho Books conectado</h2>
        <p style="color:#6b7280;margin-bottom:2rem">El refresh token fue guardado correctamente. Ya puedes cerrar esta ventana.</p>
        <a href="https://system.blackwell.university/finance"
           style="background:#4f46e5;color:white;padding:0.6rem 1.5rem;border-radius:0.5rem;text-decoration:none;font-weight:600">
          Ir a Contabilidad →
        </a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Default: Zoho Desk flow (legacy)
  return new NextResponse(`
    <html><body style="font-family:sans-serif;padding:2rem">
      <h2 style="color:#16a34a">✅ Zoho autorizado</h2>
      <p>Refresh token: <code style="background:#f3f4f6;padding:0.2rem 0.4rem;border-radius:4px">${data.refresh_token}</code></p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
