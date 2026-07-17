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
  const [{ data: types }, { data: concepts }, { data: categories }, { data: programs }, { data: employees }] = await Promise.all([
    sb.from('document_types').select('*').order('name'),
    sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge').order('type_code'),
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
    sb.from('hr_employees').select('id, full_name, position').order('full_name'),
  ])
  return NextResponse.json({ types: types ?? [], concepts: concepts ?? [], categories: categories ?? [], programs: programs ?? [], employees: employees ?? [] })
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
    simplecert_project_id: b?.simplecert_project_id?.toString().trim() || null,
    sample_image_url: b?.sample_image_url?.toString().trim() || null,
    field_map: Array.isArray(b?.field_map) ? b.field_map.filter((m: { tag?: string }) => m?.tag?.toString().trim()) : [],
    scope_category_id: b?.scope_category_id || null,
    scope_program_ids: Array.isArray(b?.scope_program_ids) ? b.scope_program_ids : [],
    requirements: Array.isArray(b?.requirements) ? b.requirements : [],
    stages: Array.isArray(b?.stages) ? b.stages : [],
    active: b?.active !== false,
    // Al emitir un título final, el egresado pasa a titulado (ver lib/titulacion).
    is_final_degree: b?.is_final_degree === true,
    delivery_mode: ['electronico', 'fisico', 'ambos'].includes(b?.delivery_mode) ? b.delivery_mode : 'electronico',
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
