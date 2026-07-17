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

  const [{ data: categories }, { data: years }, { data: programs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_years').select('id, name').order('name', { ascending: false }),
    sb.from('academic_programs').select('id, name, category_id'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let semesters: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entryGroups: any[] = []
  if (categoryId && yearId) {
    const { data: sems } = await sb.from('academic_semesters')
      .select('id, name, start_date, end_date').eq('academic_year_id', yearId).order('start_date')
    const semIds = (sems ?? []).map((s: { id: string }) => s.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let convs: any[] = []
    if (semIds.length) {
      const { data } = await sb.from('convocatorias')
        .select('id, name, academic_semester_id, deadline_date, first_day')
        .eq('product_category_id', categoryId).in('academic_semester_id', semIds).order('first_day')
      convs = data ?? []
    }

    // Carruseles de la categoría (para vincular como entrada de una convocatoria)
    const catProgs = (programs ?? []).filter((p: { category_id: string | null }) => p.category_id === categoryId)
    const progName = new Map<string, string>(catProgs.map((p: { id: string; name: string }) => [p.id, p.name]))
    if (catProgs.length) {
      const { data: gs } = await sb.from('academic_groups')
        .select('id, abbreviation, name, program_id')
        .in('program_id', catProgs.map((p: { id: string }) => p.id))
      entryGroups = (gs ?? []).map((g: { id: string; abbreviation: string | null; name: string | null; program_id: string }) => ({
        id: g.id, program_id: g.program_id,
        label: ([g.abbreviation, g.name].filter(Boolean).join(' · ') || '(sin nombre)') + ' — ' + (progName.get(g.program_id) ?? ''),
      })).sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label))
    }

    // Vínculos convocatoria → carruseles de entrada
    const convIds = convs.map((c: { id: string }) => c.id)
    const linksByConv = new Map<string, string[]>()
    if (convIds.length) {
      const { data: links } = await sb.from('convocatoria_groups')
        .select('convocatoria_id, group_id').in('convocatoria_id', convIds)
      for (const l of (links ?? []) as { convocatoria_id: string; group_id: string }[]) {
        if (!linksByConv.has(l.convocatoria_id)) linksByConv.set(l.convocatoria_id, [])
        linksByConv.get(l.convocatoria_id)!.push(l.group_id)
      }
    }
    convs = convs.map((c: { id: string }) => ({ ...c, group_ids: linksByConv.get(c.id) ?? [] }))

    const bySem = new Map<string, typeof convs>()
    for (const c of convs) { const l = bySem.get(c.academic_semester_id) ?? []; l.push(c); bySem.set(c.academic_semester_id, l) }
    semesters = (sems ?? []).map((s: { id: string }) => ({ ...s, convocatorias: bySem.get(s.id) ?? [] }))
  }

  return NextResponse.json({ categories: categories ?? [], years: years ?? [], semesters, entry_groups: entryGroups })
}

// POST → crear convocatoria (con su categoría única)
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.academic_semester_id || !b?.category_id) {
    return NextResponse.json({ error: 'Falta semestre o categoría' }, { status: 400 })
  }
  const sb = db()
  const { error } = await sb.from('convocatorias').insert({
    name: b.name || 'Nueva convocatoria',
    product_category_id: b.category_id,
    academic_semester_id: b.academic_semester_id,
    deadline_date: b.deadline_date || null,
    first_day: b.first_day || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH → editar una convocatoria (nombre + fechas)
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { error } = await sb.from('convocatorias').update({
    name: b.name,
    deadline_date: b.deadline_date || null,
    first_day: b.first_day || null,
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
  const { error } = await sb.from('convocatorias').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
