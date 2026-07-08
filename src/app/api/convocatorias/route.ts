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

// GET → catálogos (categorías, años) y, si se pasa category_id + year_id,
// los semestres del año con sus convocatorias de esa categoría.
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const sp = req.nextUrl.searchParams
  const categoryId = sp.get('category_id')
  const yearId = sp.get('year_id')

  const [{ data: categories }, { data: years }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_years').select('id, name').order('name', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let semesters: any[] = []
  if (categoryId && yearId) {
    const { data: sems } = await sb.from('academic_semesters')
      .select('id, name, start_date, end_date').eq('academic_year_id', yearId).order('start_date')
    const semIds = (sems ?? []).map((s: { id: string }) => s.id)
    const { data: links } = await sb.from('convocatoria_categories')
      .select('convocatoria_id').eq('product_category_id', categoryId)
    const convIds = (links ?? []).map((l: { convocatoria_id: string }) => l.convocatoria_id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let convs: any[] = []
    if (semIds.length && convIds.length) {
      const { data } = await sb.from('convocatorias')
        .select('id, name, academic_semester_id, registration_start_date, deadline_date, first_day, end_date')
        .in('academic_semester_id', semIds).in('id', convIds).order('first_day')
      convs = data ?? []
    }
    const bySem = new Map<string, typeof convs>()
    for (const c of convs) { const l = bySem.get(c.academic_semester_id) ?? []; l.push(c); bySem.set(c.academic_semester_id, l) }
    semesters = (sems ?? []).map((s: { id: string }) => ({ ...s, convocatorias: bySem.get(s.id) ?? [] }))
  }

  return NextResponse.json({ categories: categories ?? [], years: years ?? [], semesters })
}

// POST → crear convocatoria (ligada a la categoría seleccionada)
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.academic_semester_id || !b?.category_id) {
    return NextResponse.json({ error: 'Falta semestre o categoría' }, { status: 400 })
  }
  const sb = db()
  const { data: conv, error } = await sb.from('convocatorias').insert({
    name: b.name || 'Nueva convocatoria',
    academic_semester_id: b.academic_semester_id,
    registration_start_date: b.registration_start_date || null,
    deadline_date: b.deadline_date || null,
    first_day: b.first_day || null,
    end_date: b.end_date || null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { error: jErr } = await sb.from('convocatoria_categories')
    .insert({ convocatoria_id: conv.id, product_category_id: b.category_id })
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: conv.id })
}

// PATCH → editar una convocatoria (nombre + fechas)
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { error } = await sb.from('convocatorias').update({
    name: b.name,
    registration_start_date: b.registration_start_date || null,
    deadline_date: b.deadline_date || null,
    first_day: b.first_day || null,
    end_date: b.end_date || null,
  }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → eliminar convocatoria (falla si tiene matrículas vinculadas)
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { count } = await sb.from('academic_student_enrollments')
    .select('id', { count: 'exact', head: true }).eq('convocatoria_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `No se puede eliminar: tiene ${count} matrículas vinculadas` }, { status: 400 })
  }
  await sb.from('convocatoria_categories').delete().eq('convocatoria_id', id)
  const { error } = await sb.from('convocatorias').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
