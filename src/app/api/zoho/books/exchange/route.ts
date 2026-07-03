import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ONE-TIME endpoint: exchange a Zoho Self-Client grant token for a refresh token
// Usage: GET /api/zoho/books/exchange?code=1000.xxx...
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2>Exchange Zoho Books Grant Token</h2>
        <p>Agrega <code>?code=TU_GRANT_TOKEN</code> a la URL</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      redirect_uri: process.env.ZOHO_REDIRECT_URI ?? 'https://bgu-system.vercel.app/api/zoho/callback',
      grant_type: 'authorization_code',
    }),
  })

  const data = await res.json() as { access_token?: string; refresh_token?: string; error?: string; error_description?: string }

  if (!data.refresh_token) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">❌ Error al intercambiar token</h2>
        <pre style="background:#f3f4f6;padding:1rem;border-radius:8px">${JSON.stringify(data, null, 2)}</pre>
        <p style="color:#6b7280">El grant token expira en 10 minutos. Genera uno nuevo desde Zoho API Console → Self Client.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Save refresh token to Supabase
  await supabaseAdmin.from('app_settings').upsert({
    key: 'zoho_books_refresh_token',
    value: data.refresh_token,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  return new NextResponse(`
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:sans-serif;padding:3rem;text-align:center;max-width:500px;margin:0 auto">
      <div style="font-size:3rem;margin-bottom:1rem">✅</div>
      <h2 style="color:#16a34a">Zoho Books conectado</h2>
      <p style="color:#6b7280;margin-bottom:0.5rem">Refresh token guardado en Supabase:</p>
      <code style="background:#f3f4f6;padding:0.5rem 1rem;border-radius:6px;font-size:12px;word-break:break-all">
        ${data.refresh_token}
      </code>
      <p style="color:#9ca3af;font-size:12px;margin-top:1rem">
        También puedes guardarlo como variable de entorno <strong>ZOHO_BOOKS_REFRESH_TOKEN</strong> en Vercel.
      </p>
      <br>
      <a href="https://system.blackwell.university/finance"
         style="background:#4f46e5;color:white;padding:0.6rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:600">
        Ir a Contabilidad →
      </a>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
