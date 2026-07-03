import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BOOKS_BASE = 'https://www.zohoapis.com/books/v3'
const ORG_ID = process.env.ZOHO_BOOKS_ORG_ID ?? process.env.ZOHO_ORGANIZATION_ID!

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getBooksRefreshToken(): Promise<string | null> {
  // 1. Supabase first (set via OAuth flow — always up to date)
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'zoho_books_refresh_token')
    .single()
  if (data?.value) return data.value
  // 2. Fallback: env var
  return process.env.ZOHO_BOOKS_REFRESH_TOKEN ?? null
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; error?: string }
  if (!data.access_token) throw new Error(data.error ?? 'No access token from Zoho Books')
  return data.access_token
}

async function booksGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${BOOKS_BASE}${path}`)
  url.searchParams.set('organization_id', ORG_ID)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoho Books ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

function dateRange(monthsBack: number) {
  const to = new Date()
  const from = new Date()
  from.setMonth(from.getMonth() - monthsBack)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from_date: fmt(from), to_date: fmt(to) }
}

export async function GET() {
  // Check if Books token is configured
  const refreshToken = await getBooksRefreshToken()
  if (!refreshToken) {
    return NextResponse.json({ ok: false, needs_auth: true })
  }

  try {
    const token = await getAccessToken(refreshToken)
    const range12 = dateRange(12)
    const rangeYear = dateRange(11)

    const [cashflowRaw, plRaw, expensesRaw] = await Promise.allSettled([
      booksGet('/reports/cashflow', token, range12),
      booksGet('/reports/profitandloss', token, {
        ...rangeYear,
        filter_by: 'Date.CustomDate',
        cash_based: 'false',
      }),
      booksGet('/reports/expensedetails', token, range12),
    ])

    // Cash flow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cashflow: { month: string; cash: number }[] = []
    if (cashflowRaw.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = cashflowRaw.value?.cashflow ?? cashflowRaw.value?.cash_flow ?? []
      cashflow = rows.map((r: any) => ({
        month: r.date ?? r.month ?? r.period ?? '',
        cash: parseFloat(r.closing_balance ?? r.total ?? r.balance ?? 0),
      }))
    }

    // P&L — Zoho Books returns profit_and_loss[] with nested account_transactions[]
    // Structure: profit_and_loss[0] = Gross Profit section (income - COGS)
    //            profit_and_loss[1] = Operating section (operating expenses)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let topExpenses: { name: string; amount: number }[] = []
    const incomeExpense: { month: string; income: number; expense: number }[] = []
    let totalIncome = 0
    let totalExpense = 0
    if (plRaw.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sections: any[] = plRaw.value?.profit_and_loss ?? []
      for (const section of sections) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const txn of section.account_transactions ?? [] as any[]) {
          const name: string = txn.name ?? txn.total_label ?? ''
          const total: number = parseFloat(txn.total ?? 0)
          if (name.toLowerCase().includes('income') || name.toLowerCase().includes('revenue')) {
            totalIncome += total
          } else if (
            name.toLowerCase().includes('expense') ||
            name.toLowerCase().includes('cost')
          ) {
            totalExpense += total
            // Collect sub-accounts as top expenses
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const sub of txn.account_transactions ?? [] as any[]) {
              if (sub.name && parseFloat(sub.total ?? 0) > 0) {
                topExpenses.push({ name: sub.name, amount: parseFloat(sub.total) })
              }
            }
          }
        }
      }
      topExpenses = topExpenses.sort((a, b) => b.amount - a.amount).slice(0, 6)
    }

    // Log what came back to help debug response shape
    console.log('[finance/books] cashflow rows:', cashflow.length, '| pl status:', plRaw.status, '| expenses:', expensesRaw.status)
    if (plRaw.status === 'rejected') console.error('[finance/books] pl error:', plRaw.reason)
    if (expensesRaw.status === 'rejected') console.error('[finance/books] expenses error:', expensesRaw.reason)

    return NextResponse.json({
      ok: true,
      cashflow,
      incomeExpense,
      totalIncome,
      totalExpense,
      topExpenses,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 })
  }
}
