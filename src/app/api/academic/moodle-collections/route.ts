import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { leerNombreAula, normCode } from '@/lib/moodle-links'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string, orden: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// GET            → colecciones con su grado de cobertura
// GET ?id=       → la colección con sus casillas (una por asignatura del plan)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const sb = db()
  const id = req.nextUrl.searchParams.get('id')

  const cols = await todo(sb, 'moodle_collections', 'id, program_id, name, language, partner, suffix, active, nota', 'name')
  const programs = await todo(sb, 'academic_programs', 'id, name', 'id')
  const nombrePrograma = new Map<string, string>(programs.map((p: { id: string; name: string }) => [p.id, p.name]))
  const courses = await todo(sb, 'academic_courses', 'id, program_id, code, name', 'id')
  const links = await todo(sb, 'moodle_course_links', 'aula_id, course_id, kind, sync_enabled, collection_id, replaced_at', 'aula_id')
  const aulas = await todo(sb, 'moodle_aula_audit', 'aula_id, shortname, matriculados', 'aula_id')
  const aulaOf = new Map<number, { shortname: string | null; matriculados: number }>()
  for (const a of aulas) aulaOf.set(Number(a.aula_id), { shortname: a.shortname, matriculados: Number(a.matriculados ?? 0) })

  const resumen = cols.map((c: { id: string; program_id: string; name: string; language: string | null; partner: string | null; suffix: string | null; active: boolean }) => {
    const malla = courses.filter((x: { program_id: string | null }) => x.program_id === c.program_id)
    const suyas = links.filter((l: { collection_id: string | null }) => l.collection_id === c.id)
    const llenas = new Set(suyas.map((l: { course_id: string | null }) => String(l.course_id)))
    return {
      ...c,
      programa: nombrePrograma.get(c.program_id) ?? c.program_id,
      asignaturas: malla.length,
      con_aula: malla.filter((x: { id: string }) => llenas.has(x.id)).length,
      sincronizando: suyas.filter((l: { sync_enabled: boolean }) => l.sync_enabled).length,
      alumnos: suyas.reduce((s: number, l: { aula_id: number }) => s + (aulaOf.get(Number(l.aula_id))?.matriculados ?? 0), 0),
    }
  })

  if (!id) return NextResponse.json({ colecciones: resumen })

  const col = cols.find((c: { id: string }) => c.id === id)
  if (!col) return NextResponse.json({ error: 'Colección no encontrada' }, { status: 404 })

  // Aulas disponibles: las que no están en ninguna colección. Una aula sólo
  // puede ocupar una casilla — si ya está en otra colección, no se ofrece.
  const ocupadas = new Set(links.filter((l: { collection_id: string | null }) => l.collection_id).map((l: { aula_id: number }) => Number(l.aula_id)))
  const enEsta = new Map<string, { aula_id: number; sync_enabled: boolean }>()
  for (const l of links) {
    if (l.collection_id === id && l.course_id) enEsta.set(String(l.course_id), { aula_id: Number(l.aula_id), sync_enabled: !!l.sync_enabled })
  }

  const malla = courses.filter((x: { program_id: string | null }) => x.program_id === col.program_id)
  const casillas = malla.map((c: { id: string; code: string | null; name: string | null }) => {
    const puesta = enEsta.get(c.id)
    // Candidatas: aulas libres cuyo código coincide con el de la asignatura. Si
    // la colección declara su sufijo, las que lo llevan van primero.
    const candidatas = aulas
      .filter((a: { aula_id: number; shortname: string | null }) => {
        if (ocupadas.has(Number(a.aula_id))) return false
        const { code } = leerNombreAula(a.shortname)
        return code != null && code === normCode(c.code)
      })
      .map((a: { aula_id: number; shortname: string | null; matriculados: number }) => ({
        aula_id: Number(a.aula_id), shortname: a.shortname, matriculados: Number(a.matriculados ?? 0),
        coincide_sufijo: !!(col.suffix && String(a.shortname ?? '').includes(col.suffix)),
      }))
      .sort((x: { coincide_sufijo: boolean; matriculados: number }, y: { coincide_sufijo: boolean; matriculados: number }) =>
        Number(y.coincide_sufijo) - Number(x.coincide_sufijo) || y.matriculados - x.matriculados)

    return {
      course_id: c.id, code: c.code, name: c.name,
      aula: puesta ? { ...puesta, ...(aulaOf.get(puesta.aula_id) ?? { shortname: null, matriculados: 0 }) } : null,
      candidatas: puesta ? [] : candidatas.slice(0, 8),
    }
  }).sort((a: { code: string | null }, b: { code: string | null }) => String(a.code).localeCompare(String(b.code)))

  return NextResponse.json({
    coleccion: { ...col, programa: nombrePrograma.get(col.program_id) ?? col.program_id },
    casillas,
    con_aula: casillas.filter((c: { aula: unknown }) => c.aula).length,
    total: casillas.length,
  })
}

// ---------------------------------------------------------------------------
// POST — acciones sobre colecciones
//   { accion:'crear', program_id, name, language?, partner?, suffix? }
//   { accion:'asignar', collection_id, course_id, aula_id }   ← ocupa la casilla
//   { accion:'vaciar',  collection_id, course_id }
//   { accion:'sincronizar'|'apagar', collection_id }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const b = await req.json().catch(() => null) as Record<string, string> | null
  if (!b?.accion) return NextResponse.json({ error: 'Falta la acción' }, { status: 400 })
  const sb = db()
  const quien = g.user.email ?? g.user.id
  const ahora = new Date().toISOString()

  if (b.accion === 'crear') {
    if (!b.program_id || !b.name) return NextResponse.json({ error: 'Falta el programa o el nombre' }, { status: 400 })
    const { data, error } = await sb.from('moodle_collections').insert({
      program_id: b.program_id, name: b.name.trim(),
      language: b.language || null, partner: b.partner || null, suffix: b.suffix || null,
      created_by: quien,
    }).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data?.id })
  }

  if (b.accion === 'asignar') {
    if (!b.collection_id || !b.course_id || !b.aula_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    const aulaId = Number(b.aula_id)

    // Una casilla, un aula: si ya había una, sale de la colección. Conserva su
    // identidad y su sincronía — los alumnos que quedaron dentro terminan su
    // curso y sus notas siguen llegando. Lo que cambia es dónde entran los
    // nuevos.
    const { data: previa } = await sb.from('moodle_course_links')
      .select('aula_id').eq('collection_id', b.collection_id).eq('course_id', b.course_id).maybeSingle()
    if (previa && Number(previa.aula_id) !== aulaId) {
      await sb.from('moodle_course_links')
        .update({ collection_id: null, replaced_at: ahora, replaced_by: quien })
        .eq('aula_id', previa.aula_id)
    }

    const { error } = await sb.from('moodle_course_links').upsert({
      aula_id: aulaId, course_id: b.course_id, kind: 'asignatura',
      collection_id: b.collection_id, replaced_at: null, replaced_by: null,
      linked_by: quien, linked_at: ahora,
    }, { onConflict: 'aula_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reemplazo: previa ? Number(previa.aula_id) : null })
  }

  if (b.accion === 'vaciar') {
    const { error } = await sb.from('moodle_course_links')
      .update({ collection_id: null }).eq('collection_id', b.collection_id).eq('course_id', b.course_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'sincronizar' || b.accion === 'apagar') {
    const on = b.accion === 'sincronizar'
    const { error, count } = await sb.from('moodle_course_links')
      .update({ sync_enabled: on, sync_enabled_by: quien, sync_enabled_at: ahora }, { count: 'exact' })
      .eq('collection_id', b.collection_id).eq('kind', 'asignatura')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, aulas: count ?? 0, sincronizando: on })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
