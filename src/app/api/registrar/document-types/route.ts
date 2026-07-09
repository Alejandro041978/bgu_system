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

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const [{ data: types }, { data: concepts }] = await Promise.all([
    sb.from('document_types').select('*').order('name'),
    sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge').order('type_code'),
  ])
  return NextResponse.json({ types: types ?? [], concepts: concepts ?? [] })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clean(b: any) {
  return {
    name: b?.name?.trim() || 'Documento',
    description: b?.description?.trim() || null,
    price: Number(b?.price) || 0,
    currency: b?.currency || 'USD',
    charge_concept: b?.charge_concept != null && b?.charge_concept !== '' ? Number(b.charge_concept) : null,
    template_body: b?.template_body ?? null,
    requirements: Array.isArray(b?.requirements) ? b.requirements : [],
    stages: Array.isArray(b?.stages) ? b.stages : [],
    active: b?.active !== false,
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const { data, error } = await db().from('document_types').insert(clean(b)).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await db().from('document_types').update({ ...clean(b), updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await db().from('document_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
