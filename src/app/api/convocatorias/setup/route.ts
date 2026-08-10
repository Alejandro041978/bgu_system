import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  // isSuperadmin() devuelve true para estudiantes: la comprobación de staff es
  // por identidad, no por rol.
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// ---------------------------------------------------------------------------
// La convocatoria declara, por programa, en qué COLECCIÓN de aulas y en qué
// CARRUSEL entra quien se matricule por ella. La matrícula hereda ese par.
//
// Antes la colección se elegía a mano en cada matrícula y el carrusel se
// resolvía solo cuando el programa tenía una única entrada. Resultado: 23 de
// 1.104 matrículas con colección, y las demás aterrizando en el aula del
// respaldo, la misma para todos.
// ---------------------------------------------------------------------------

// GET ?convocatoria_id= → los programas de su categoría, con lo que hay
// disponible para elegir y lo ya elegido.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const g = await requireStaff(); if ('error' in g) return g.error

  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria_id')
  if (!convocatoriaId) return NextResponse.json({ error: 'Falta convocatoria_id' }, { status: 400 })
  const sb = db()

  const { data: conv } = await sb.from('convocatorias')
    .select('id, name, product_category_id').eq('id', convocatoriaId).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Convocatoria no encontrada' }, { status: 404 })

  const { data: progs } = await sb.from('academic_programs')
    .select('id, name, partner_campus').eq('category_id', conv.product_category_id).order('name')
  const programIds = (progs ?? []).map((p: { id: string }) => p.id)
  if (!programIds.length) return NextResponse.json({ convocatoria: conv, programas: [] })

  const [{ data: cols }, { data: groups }, { data: setup }] = await Promise.all([
    sb.from('moodle_collections').select('id, program_id, name, language, partner, active').in('program_id', programIds).order('name'),
    sb.from('academic_groups').select('id, program_id, abbreviation, name, next_group_id').in('program_id', programIds),
    sb.from('convocatoria_program_setup').select('program_id, collection_id, group_id').eq('convocatoria_id', convocatoriaId),
  ])

  // Casillas ocupadas de cada colección: sirve para avisar de una colección a
  // medio armar antes de atarle una convocatoria entera.
  const colIds = (cols ?? []).map((c: { id: string }) => c.id)
  const casillas = new Map<string, number>()
  if (colIds.length) {
    const { data: links } = await sb.from('moodle_course_links')
      .select('collection_id').in('collection_id', colIds).eq('kind', 'asignatura').is('replaced_at', null)
    for (const l of (links ?? []) as { collection_id: string }[]) {
      casillas.set(l.collection_id, (casillas.get(l.collection_id) ?? 0) + 1)
    }
  }
  const { data: courses } = await sb.from('academic_courses').select('program_id').in('program_id', programIds)
  const malla = new Map<string, number>()
  for (const c of (courses ?? []) as { program_id: string }[]) malla.set(c.program_id, (malla.get(c.program_id) ?? 0) + 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gs = (groups ?? []) as any[]
  const apuntados = new Set(gs.map(x => x.next_group_id).filter(Boolean))
  const elegido = new Map((setup ?? []).map((s: { program_id: string }) => [s.program_id, s]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programas = (progs ?? []).map((p: any) => ({
    id: p.id, name: p.name, partner_campus: !!p.partner_campus,
    malla: malla.get(p.id) ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    colecciones: (cols ?? []).filter((c: any) => c.program_id === p.id).map((c: any) => ({
      id: c.id, name: c.name, language: c.language, partner: c.partner, active: c.active,
      casillas: casillas.get(c.id) ?? 0,
    })),
    carruseles: gs.filter(x => x.program_id === p.id).map(x => ({
      id: x.id, abbreviation: x.abbreviation, name: x.name,
      // El carrusel de entrada es el que ningún otro apunta. Se marca para que
      // quien configura no tenga que deducir la cadena de memoria.
      es_entrada: !apuntados.has(x.id),
    })),
    setup: elegido.get(p.id) ?? { collection_id: null, group_id: null },
  }))

  return NextResponse.json({ convocatoria: { id: conv.id, name: conv.name }, programas })
}

// PUT { convocatoria_id, program_id, collection_id, group_id } → fija el par.
// Con ambos en null se borra la fila: "sin configurar" es la ausencia, no una
// fila de nulos que parece configurada.
export async function PUT(req: NextRequest) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const g = await requireStaff(); if ('error' in g) return g.error

  const b = await req.json().catch(() => null) as {
    convocatoria_id?: string; program_id?: string
    collection_id?: string | null; group_id?: string | null
  } | null
  if (!b?.convocatoria_id || !b?.program_id) {
    return NextResponse.json({ error: 'Falta convocatoria_id o program_id' }, { status: 400 })
  }
  const sb = db()
  const collectionId = b.collection_id || null
  const groupId = b.group_id || null

  // La colección y el carrusel tienen que ser DE ese programa. Sin esto, un
  // clic en la lista equivocada ataría media convocatoria a las aulas de otra
  // carrera y nadie lo vería hasta que un estudiante entrara a un aula ajena.
  if (collectionId) {
    const { data: c } = await sb.from('moodle_collections').select('program_id').eq('id', collectionId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Colección no encontrada' }, { status: 404 })
    if (c.program_id !== b.program_id) return NextResponse.json({ error: 'Esa colección es de otro programa' }, { status: 400 })
  }
  if (groupId) {
    const { data: gr } = await sb.from('academic_groups').select('program_id').eq('id', groupId).maybeSingle()
    if (!gr) return NextResponse.json({ error: 'Carrusel no encontrado' }, { status: 404 })
    if (gr.program_id !== b.program_id) return NextResponse.json({ error: 'Ese carrusel es de otro programa' }, { status: 400 })
  }

  if (!collectionId && !groupId) {
    const { error } = await sb.from('convocatoria_program_setup').delete()
      .eq('convocatoria_id', b.convocatoria_id).eq('program_id', b.program_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, borrado: true })
  }

  const { error } = await sb.from('convocatoria_program_setup').upsert({
    convocatoria_id: b.convocatoria_id, program_id: b.program_id,
    collection_id: collectionId, group_id: groupId,
    updated_at: new Date().toISOString(),
    updated_by: g.user.email ?? null,
  }, { onConflict: 'convocatoria_id,program_id' })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Falta correr supabase/convocatoria_setup.sql' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
