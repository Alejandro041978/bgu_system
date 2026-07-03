import { NextResponse } from 'next/server'

export async function GET() {
  const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN
  const clientId = process.env.ZOHO_BOOKS_CLIENT_ID ?? process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET ?? process.env.ZOHO_CLIENT_SECRET

  if (!refreshToken) return NextResponse.json({ error: 'No ZOHO_BOOKS_REFRESH_TOKEN env var' })

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  return NextResponse.json({
    status: res.status,
    using_client_id: clientId?.slice(0, 10) + '...',
    has_books_client: !!process.env.ZOHO_BOOKS_CLIENT_ID,
    zoho_response: data,
  })
}
