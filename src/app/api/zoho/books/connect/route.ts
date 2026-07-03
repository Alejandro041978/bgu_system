import { NextResponse } from 'next/server'

export async function GET() {
  const params = new URLSearchParams({
    scope: 'ZohoBooks.reports.READ,ZohoBooks.dashboard.READ,ZohoBooks.accountants.READ',
    client_id: process.env.ZOHO_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'}/api/zoho/books/callback`,
    access_type: 'offline',
    prompt: 'consent',
  })

  const url = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`
  return NextResponse.redirect(url)
}
