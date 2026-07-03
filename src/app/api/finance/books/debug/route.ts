import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: tokenRow } = await supabaseAdmin
    .from('app_settings').select('value').eq('key', 'zoho_books_refresh_token').single()
  const refreshToken = tokenRow?.value ?? process.env.ZOHO_BOOKS_REFRESH_TOKEN

  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' })

  const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) return NextResponse.json({ token_error: tokenData })

  const token = tokenData.access_token

  // List all organizations this token can access
  const orgsRes = await fetch('https://www.zohoapis.com/books/v3/organizations', {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const orgsData = await orgsRes.json()

  return NextResponse.json({
    current_org_id_env: process.env.ZOHO_ORGANIZATION_ID,
    orgs_status: orgsRes.status,
    orgs: orgsData,
  })
}
