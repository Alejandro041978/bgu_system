import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// GET → categorías con conteo de programas y convocatorias
export async function GET() {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const [{ data: cats }, { data: progs }, { data: convs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name, passing_score').order('name'),
    sb.from('academic_programs').select('id, category_id'),
    sb.from('convocatorias').select('id, product_category_id'),
  ])
  const progCount = new Map<string, number>()
  for (const p of (progs ?? []) as { category_id: string | null }[]) {
    if (p.category_id) progCount.set(p.category_id, (progCount.get(p.category_id) ?? 0) + 1)
  }
  const convCount = new Map<string, number>()
  for (const c of (convs ?? []) as { product_category_id: string | null }[]) {
    if (c.product_category_id) convCount.set(c.product_category_id, (convCount.get(c.product_category_id) ?? 0) + 1)
  }
  return NextResponse.json({
    categories: ((cats ?? []) as { id: string; name: string; passing_score: number | null }[]).map(c => ({
      ...c,
      programs: progCount.get(c.id) ?? 0,
      convocatorias: convCount.get(c.id) ?? 0,
    })),
  })
}

// POST { name } → crea una categoría
export async function POST(req: NextRequest) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { name?: string } | null
  const name = b?.name?.trim()
  if (!name) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })
  const sb = db()
  const { data: dup } = await sb.from('academic_programs_category').select('id').ilike('name', name).limit(1)
  if ((dup ?? []).length) return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
  // id explícito: la tabla nació del sync y su default no está garantizado
  const id = crypto.randomUUID()
  const { error } = await sb.from('academic_programs_category').insert({ id, name })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, name })
}
