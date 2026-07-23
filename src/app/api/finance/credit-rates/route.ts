import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET → tarifario completo (historial) + catálogos + créditos por programa
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const [{ data: rates }, { data: categories }, { data: programs }, { data: courses }] = await Promise.all([
    sb.from('credit_rates').select('*').order('effective_from', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('academic_programs_category').select('id, name, sigla').order('name'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
    sb.from('academic_courses').select('program_id, credits'),
  ])
  const creditsByProgram: Record<string, number> = {}
  for (const c of (courses ?? []) as { program_id: string | null; credits: number | null }[]) {
    if (!c.program_id) continue
    creditsByProgram[c.program_id] = (creditsByProgram[c.program_id] ?? 0) + Number(c.credits ?? 0)
  }
  return NextResponse.json({ rates: rates ?? [], categories: categories ?? [], programs: programs ?? [], credits_by_program: creditsByProgram })
}

// POST { category_id | program_id, price_per_credit, effective_from?, note? }
// → publica una VERSIÓN nueva del precio oficial (nunca se edita una existente)
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const price = Number(b?.price_per_credit)
  if (!isFinite(price) || price <= 0) return NextResponse.json({ error: 'Precio por crédito inválido' }, { status: 400 })
  if (!b?.category_id === !b?.program_id) {
    return NextResponse.json({ error: 'La tarifa debe asociarse a UNA categoría o a UN programa (no ambos, no ninguno)' }, { status: 400 })
  }
  const { data, error } = await db().from('credit_rates').insert({
    category_id: b.category_id || null,
    program_id: b.program_id || null,
    price_per_credit: price,
    currency: 'USD',
    effective_from: b?.effective_from || new Date().toISOString().slice(0, 10),
    note: b?.note?.toString().trim() || null,
    created_by: user.email ?? user.id,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// DELETE ?id= → solo versiones con vigencia FUTURA (corrección antes de que
// el precio entre en vigor; lo ya vigente es historia regulada e intocable)
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { data: r } = await sb.from('credit_rates').select('effective_from').eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 })
  const hoy = new Date().toISOString().slice(0, 10)
  if (String(r.effective_from) <= hoy) {
    return NextResponse.json({ error: 'Esta versión ya está (o estuvo) vigente: los precios publicados no se borran. Publica una versión nueva.' }, { status: 400 })
  }
  const { error } = await sb.from('credit_rates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
