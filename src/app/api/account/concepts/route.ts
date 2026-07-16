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

  // Unir AMBAS fuentes: los códigos que aparecen en cargos reales (con conteo) y
  // los conceptos creados a mano (que aún no tienen cargos, n=0). Sin esto, un
  // concepto nuevo no se vería para editarlo.
  const meta = new Map<string, { abbr: string | null; name: string | null }>()
  const count = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (concepts ?? []) as any[]) meta.set(`${c.kind}:${c.type_code}`, { abbr: c.abbr, name: c.name })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (counts ?? []) as any[]) count.set(`${c.kind}:${c.type_code}`, c.n)

  const keys = new Set<string>([...meta.keys(), ...count.keys()])
  const rows = [...keys].map(k => {
    const [kind, code] = k.split(':')
    const m = meta.get(k)
    return { kind, type_code: Number(code), n: count.get(k) ?? 0, abbr: m?.abbr ?? null, name: m?.name ?? null }
  }).sort((a, b) => a.kind.localeCompare(b.kind) || b.n - a.n || a.type_code - b.type_code)

  return NextResponse.json({ concepts: rows })
}

// POST → editar un concepto existente { kind, type_code, abbr, name }, o CREAR
// uno nuevo si no viene type_code (create:true). Al crear, se asigna un código
// propio con base 1000 para no colisionar nunca con los códigos importados
// (1-16), ahora que operamos todo desde el ERP.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const kind = body?.kind === 'payment' ? 'payment' : 'charge'
  const sb = db()

  let type_code = Number(body?.type_code)

  // Crear: sin type_code → asignar el siguiente código propio (>= 1000).
  if (body?.create || !Number.isInteger(type_code)) {
    if (!body?.name?.trim() && !body?.abbr?.trim()) {
      return NextResponse.json({ error: 'Ingresa al menos el nombre del concepto' }, { status: 400 })
    }
    const { data: existing } = await sb.from('account_concepts').select('type_code').eq('kind', kind)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const max = Math.max(999, ...((existing ?? []) as any[]).map(x => Number(x.type_code) || 0))
    type_code = max + 1
  }

  const { error } = await sb.from('account_concepts').upsert(
    { kind, type_code, abbr: body?.abbr?.trim() || null, name: body?.name?.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: 'kind,type_code' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, type_code })
}
