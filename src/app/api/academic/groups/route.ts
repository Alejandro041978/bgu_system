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

// GET → catálogos (categorías, años con semestres, programas) y, con category_id + year_id,
// los grupos de ese año/categoría con conteo de asignaturas y estudiantes.
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const sp = req.nextUrl.searchParams
  const categoryId = sp.get('category_id')
  const yearId = sp.get('year_id')

  const [{ data: categories }, { data: years }, { data: programs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_years').select('id, name, semesters:academic_semesters(id, name)').order('name', { ascending: false }),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let groups: any[] = []
  if (categoryId && yearId) {
    const { data: sems } = await sb.from('academic_semesters').select('id, name').eq('academic_year_id', yearId)
    const semIds = (sems ?? []).map((s: { id: string }) => s.id)
    const semName = new Map<string, string>((sems ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))
    if (semIds.length) {
      const { data: gs } = await sb.from('academic_groups')
        .select('id, name, semester_id, program_id')
        .eq('category_id', categoryId).in('semester_id', semIds).order('name')
      const groupIds = (gs ?? []).map((g: { id: string }) => g.id)

      const offCount = new Map<string, number>()
      const stuCount = new Map<string, number>()
      if (groupIds.length) {
        const [{ data: offs }, { data: gss }] = await Promise.all([
          sb.from('semester_offerings').select('group_id').in('group_id', groupIds),
          sb.from('academic_group_students').select('group_id').in('group_id', groupIds),
        ])
        for (const o of offs ?? []) offCount.set(o.group_id, (offCount.get(o.group_id) ?? 0) + 1)
        for (const s of gss ?? []) stuCount.set(s.group_id, (stuCount.get(s.group_id) ?? 0) + 1)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      groups = (gs ?? []).map((g: any) => ({
        ...g, semester_name: semName.get(g.semester_id) ?? '',
        offerings_count: offCount.get(g.id) ?? 0, students_count: stuCount.get(g.id) ?? 0,
      }))
    }
  }

  return NextResponse.json({ categories: categories ?? [], years: years ?? [], programs: programs ?? [], groups })
}

// POST → crear grupo
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.name?.trim() || !b?.semester_id || !b?.category_id) {
    return NextResponse.json({ error: 'Falta nombre, semestre o categoría' }, { status: 400 })
  }
  const sb = db()
  const { data, error } = await sb.from('academic_groups').insert({
    name: b.name.trim(), semester_id: b.semester_id, category_id: b.category_id, program_id: b.program_id || null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// PATCH → renombrar / reasignar programa
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {}
  if (b.name != null) patch.name = String(b.name).trim()
  if ('program_id' in b) patch.program_id = b.program_id || null
  const { error } = await sb.from('academic_groups').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → eliminar grupo (desliga sus asignaturas; borra membresías por cascade)
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  await sb.from('semester_offerings').update({ group_id: null }).eq('group_id', id)
  const { error } = await sb.from('academic_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
