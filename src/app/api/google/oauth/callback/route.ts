import { NextRequest, NextResponse } from 'next/server'

// Callback del consentimiento único: canjea el código y muestra el refresh
// token UNA sola vez para copiarlo a Vercel. No se guarda en ningún lado.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: req.nextUrl.searchParams.get('error') ?? 'Sin código' }, { status: 400 })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: 'https://system.blackwell.university/api/google/oauth/callback',
      grant_type: 'authorization_code',
    }),
  })
  const d = await res.json()
  if (!res.ok || !d.refresh_token) {
    return NextResponse.json({ error: d.error_description ?? d.error ?? 'Sin refresh_token (¿faltó prompt=consent?)' }, { status: 500 })
  }

  const html = `<!doctype html><html><body style="font-family:Arial;max-width:640px;margin:40px auto;color:#1f2937">
    <h2 style="color:#166534">✓ Autorización completada</h2>
    <p>Copia este <b>refresh token</b> y guárdalo en Vercel como variable
    <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> (Production). Se muestra una sola vez.</p>
    <textarea style="width:100%;height:90px;font-family:monospace;font-size:12px" readonly onclick="this.select()">${d.refresh_token}</textarea>
    <p style="color:#6b7280;font-size:13px">Después de guardarlo, redeploya el proyecto (o espera al siguiente deploy) y el botón
    "Crear correo estudiantil" quedará operativo. Esta página no guarda nada.</p>
  </body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
