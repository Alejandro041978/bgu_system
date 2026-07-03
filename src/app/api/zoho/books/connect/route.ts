import { NextResponse } from 'next/server'

// Must match EXACTLY the redirect URI registered in Zoho API Console
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI ?? 'https://bgu-system.vercel.app/api/zoho/callback'

export async function GET() {
  const params = new URLSearchParams({
    scope: 'ZohoBooks.reports.READ,ZohoBooks.invoices.READ,ZohoBooks.expenses.READ',
    client_id: process.env.ZOHO_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    access_type: 'offline',
    prompt: 'consent',
    state: 'books', // identify this as a Books auth in the callback
  })

  const url = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`
  return NextResponse.redirect(url)
}
