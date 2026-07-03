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
  const orgId = process.env.ZOHO_BOOKS_ORG_ID ?? process.env.ZOHO_ORGANIZATION_ID!
  const BASE = 'https://www.zohoapis.com/books/v3'

  const today = new Date()
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)

  const plRes = await fetch(
    `${BASE}/reports/profitandloss?organization_id=${orgId}&from_date=${yearStart}&to_date=${todayStr}&cash_based=false`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  const plData = await plRes.json()

  const expRes = await fetch(
    `${BASE}/reports/expensedetails?organization_id=${orgId}&from_date=${yearStart}&to_date=${todayStr}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  const expData = await expRes.json()

  return NextResponse.json({ pl: plData, exp_keys: Object.keys(expData), exp_sample: expData })
}
