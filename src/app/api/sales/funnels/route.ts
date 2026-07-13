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
  const [{ data: funnels }, { data: bots }, { data: categories }, { data: programs }] = await Promise.all([
    sb.from('sales_funnels').select('*').order('bot_key').order('sort_order'),
    sb.from('bots').select('key, name').eq('role', 'ventas').eq('active', true).order('name'),
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
  ])
  return NextResponse.json({ funnels: funnels ?? [], bots: bots ?? [], categories: categories ?? [], programs: programs ?? [] })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clean(b: any) {
  return {
    bot_key: b?.bot_key,
    name: b?.name?.trim() || 'Embudo',
    scope_category_id: b?.scope_category_id || null,
    scope_program_ids: Array.isArray(b?.scope_program_ids) ? b.scope_program_ids : [],
    active: b?.active !== false,
    sort_order: Number(b?.sort_order) || 0,
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.bot_key) return NextResponse.json({ error: 'Falta el bot' }, { status: 400 })
  const { data, error } = await db().from('sales_funnels').insert(clean(b)).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await db().from('sales_funnels').update({ ...clean(b), updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  // Desvincula los leads antes de borrar el embudo
  await db().from('sales_leads').update({ funnel_id: null }).eq('funnel_id', id)
  const { error } = await db().from('sales_funnels').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
