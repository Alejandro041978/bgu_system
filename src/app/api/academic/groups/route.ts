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

// GET → catálogos (categorías, programas) y, con program_id, los grupos de ese programa.
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const programId = req.nextUrl.searchParams.get('program_id')

  const [{ data: categories }, { data: programs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let groups: any[] = []
  if (programId) {
    const { data: gs } = await sb.from('academic_groups')
      .select('id, abbreviation, name, detail').eq('program_id', programId).order('name')
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
      ...g, offerings_count: offCount.get(g.id) ?? 0, students_count: stuCount.get(g.id) ?? 0,
    }))
  }

  return NextResponse.json({ categories: categories ?? [], programs: programs ?? [], groups })
}

// POST → crear grupo (asociado a programa)
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.program_id || !(b?.name?.trim() || b?.abbreviation?.trim())) {
    return NextResponse.json({ error: 'Falta programa y denominación/abreviatura' }, { status: 400 })
  }
  const sb = db()
  const { data, error } = await sb.from('academic_groups').insert({
    program_id: b.program_id, category_id: b.category_id || null,
    abbreviation: b.abbreviation?.trim() || null, name: b.name?.trim() || null, detail: b.detail?.trim() || null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// PATCH → editar campos descriptivos y/o la secuencia de carruseles.
// next_group_id define el carrusel al que se avanza al aprobar este; se valida
// que sea del mismo programa, que no forme ciclo y que la cadena siga lineal
// (dos carruseles no pueden desembocar en el mismo siguiente).
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {}
  for (const k of ['abbreviation', 'name', 'detail'] as const) if (k in b) patch[k] = b[k]?.trim() || null

  if ('next_group_id' in b) {
    const next = b.next_group_id || null
    if (next) {
      const { data: all } = await sb.from('academic_groups').select('id, program_id, next_group_id, abbreviation, name')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId = new Map<string, any>((all ?? []).map((g: { id: string }) => [g.id, g]))
      const me = byId.get(b.id), target = byId.get(next)
      if (!me || !target) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
      if (next === b.id) return NextResponse.json({ error: 'Un carrusel no puede ser su propio siguiente' }, { status: 400 })
      if (target.program_id !== me.program_id) {
        return NextResponse.json({ error: 'El siguiente carrusel debe ser del mismo programa' }, { status: 400 })
      }
      const otro = (all ?? []).find((g: { id: string; next_group_id: string | null }) => g.id !== b.id && g.next_group_id === next)
      if (otro) {
        return NextResponse.json({ error: `"${otro.abbreviation ?? otro.name}" ya desemboca en ese carrusel; la secuencia debe ser lineal` }, { status: 400 })
      }
      // ¿la cadena desde el destino regresa a este grupo? → ciclo
      let cur = target, hops = 0
      while (cur?.next_group_id && hops++ < 100) {
        if (cur.next_group_id === b.id) {
          return NextResponse.json({ error: 'Eso formaría un ciclo: la cadena del destino regresa a este carrusel' }, { status: 400 })
        }
        cur = byId.get(cur.next_group_id)
      }
    }
    patch.next_group_id = next
  }

  const { error } = await sb.from('academic_groups').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → eliminar grupo (desliga sus asignaturas; membresías por cascade)
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
