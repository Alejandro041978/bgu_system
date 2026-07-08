import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → tipos presentes en la data (con conteo) + su abreviatura/nombre editable.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const [{ data: counts }, { data: concepts }] = await Promise.all([
    sb.from('account_type_counts').select('kind, type_code, n'),
    sb.from('account_concepts').select('kind, type_code, abbr, name'),
  ])

  const byKey = new Map<string, { abbr: string | null; name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (concepts ?? []) as any[]) byKey.set(`${c.kind}:${c.type_code}`, { abbr: c.abbr, name: c.name })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((counts ?? []) as any[]).map(c => {
    const m = byKey.get(`${c.kind}:${c.type_code}`)
    return { kind: c.kind, type_code: c.type_code, n: c.n, abbr: m?.abbr ?? null, name: m?.name ?? null }
  }).sort((a, b) => a.kind.localeCompare(b.kind) || b.n - a.n)

  return NextResponse.json({ concepts: rows })
}

// POST → upsert de un concepto { kind, type_code, abbr, name }.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const kind = body?.kind === 'payment' ? 'payment' : 'charge'
  const type_code = Number(body?.type_code)
  if (!Number.isInteger(type_code)) return NextResponse.json({ error: 'type_code inválido' }, { status: 400 })

  const sb = db()
  const { error } = await sb.from('account_concepts').upsert(
    { kind, type_code, abbr: body?.abbr?.trim() || null, name: body?.name?.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: 'kind,type_code' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
