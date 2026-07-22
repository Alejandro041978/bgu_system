import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

const CATEGORIES = ['eventos', 'libros', 'viajes', 'otros']

// Otros ingresos (no académicos, derivados de la bandeja Flywire).
// GET ?year= → filas + totales por categoría y por año
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const year = req.nextUrl.searchParams.get('year')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('other_income').select('*')
      .order('income_date', { ascending: false }).range(from, from + 999)
    if (error) return NextResponse.json({ error: 'Falta correr supabase/other_income.sql: ' + error.message }, { status: 400 })
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  const years = [...new Set(rows.map(r => String(r.income_date ?? '').slice(0, 4)).filter(Boolean))].sort().reverse()
  const filtered = year ? rows.filter(r => String(r.income_date ?? '').startsWith(year)) : rows
  const porCategoria: Record<string, { n: number; total: number }> = {}
  for (const r of filtered) {
    const c = r.category ?? 'otros'
    if (!porCategoria[c]) porCategoria[c] = { n: 0, total: 0 }
    porCategoria[c].n++
    porCategoria[c].total += Number(r.amount ?? 0)
  }
  const total = filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return NextResponse.json({ rows: filtered, years, por_categoria: porCategoria, total: Math.round(total * 100) / 100 })
}

// PATCH { id, category?, note? } → editar la tabulación
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { id?: string; category?: string; note?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.category !== undefined) {
    if (!CATEGORIES.includes(b.category)) return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
    patch.category = b.category
  }
  if (b.note !== undefined) patch.note = b.note.trim() || null
  const { error } = await db().from('other_income').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { id } → deshace la derivación: borra el ingreso y quita el evento de
// resolución para que la referencia VUELVA a la bandeja de conciliación.
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { id?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { data: row } = await sb.from('other_income').select('id, flywire_ref').eq('id', b.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const { error } = await sb.from('other_income').delete().eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (row.flywire_ref) {
    await sb.from('flywire_events').delete()
      .eq('payment_id', row.flywire_ref).eq('event_type', 'resolution').eq('status', 'otros_ingresos')
  }
  return NextResponse.json({ ok: true, devuelto_a_bandeja: !!row.flywire_ref })
}
