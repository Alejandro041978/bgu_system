import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Get refresh token (Supabase first)
  const { data: tokenRow } = await supabaseAdmin
    .from('app_settings').select('value').eq('key', 'zoho_books_refresh_token').single()
  const refreshToken = tokenRow?.value ?? process.env.ZOHO_BOOKS_REFRESH_TOKEN
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET

  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' })

  // Get access token
  const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    return NextResponse.json({ token_error: tokenData })
  }

  const token = tokenData.access_token
  const orgId = process.env.ZOHO_ORGANIZATION_ID!
  const BASE = 'https://www.zohoapis.com/books/v3'

  const today = new Date()
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)

  // Fetch P&L raw
  const plUrl = `${BASE}/reports/profitandloss?organization_id=${orgId}&from_date=${yearStart}&to_date=${todayStr}&cash_based=false`
  const plRes = await fetch(plUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  const plData = await plRes.json()

  // Fetch cashflow raw
  const cfUrl = `${BASE}/reports/cashflow?organization_id=${orgId}&from_date=${yearStart}&to_date=${todayStr}`
  const cfRes = await fetch(cfUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  const cfData = await cfRes.json()

  return NextResponse.json({
    pl_status: plRes.status,
    pl_keys: Object.keys(plData),
    pl_data: plData,
    cf_status: cfRes.status,
    cf_keys: Object.keys(cfData),
    cf_data: cfData,
  })
}
