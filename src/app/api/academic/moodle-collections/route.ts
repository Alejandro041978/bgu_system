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
  const programs = await todo(sb, 'academic_programs', 'id, name, category_id, partner_campus, category:academic_programs_category(id, name)', 'id')
  const nombrePrograma = new Map<string, string>(programs.map((p: { id: string; name: string }) => [p.id, p.name]))
  // Categoría del programa: con 65 programas y varias colecciones cada uno, la
  // lista se vuelve larga y casi siempre se trabaja sobre una familia entera
  // (los bachelors, los DCE) y no sobre un programa suelto.
  const catDe = new Map<string, { id: string; name: string } | null>(
    programs.map((p: { id: string; category: { id: string; name: string } | null }) => [p.id, p.category ?? null]))
  const courses = await todo(sb, 'academic_courses', 'id, program_id, code, name', 'id')
  const links = await todo(sb, 'moodle_course_links', 'aula_id, course_id, kind, sync_enabled, collection_id, replaced_at', 'aula_id')
  const aulas = await todo(sb, 'moodle_aula_audit', 'aula_id, shortname, matriculados', 'aula_id')
  // Alumnos ÚNICOS de cada colección: los que la tienen elegida en su matrícula.
  // No es lo mismo que la suma de matriculados de sus aulas —quien lleva 12
  // asignaturas cuenta 12 veces ahí—, y es el número que dice cuántos
  // estudiantes del total estudian en esta colección.
  const matriculas = await todo(sb, 'academic_student_enrollments', 'student_id, program_id, collection_id, status', 'id')
  const alumnosDe = new Map<string, Set<string>>()
  const activosDe = new Map<string, Set<string>>()
  for (const m of matriculas as { student_id: string; collection_id: string | null; status: string | null }[]) {
    if (!m.collection_id) continue
    if (!alumnosDe.has(m.collection_id)) { alumnosDe.set(m.collection_id, new Set()); activosDe.set(m.collection_id, new Set()) }
    alumnosDe.get(m.collection_id)!.add(m.student_id)
    if (m.status === 'activa' || m.status === 'activo') activosDe.get(m.collection_id)!.add(m.student_id)
  }
  // Estudiantes DISTINTOS que aparecen en las aulas de cada colección, según
  // las notas importadas de esas aulas. No es el padrón exacto —el ERP guarda
  // el conteo de matriculados del aula, no quiénes son— pero es el único
  // recuento por persona que tenemos hoy, y no duplica a quien lleva doce
  // asignaturas. Para el padrón exacto haría falta guardar la lista de
  // matriculados que el import ya consulta en cada corrida.
  const notas = await todo(sb, 'academic_grades', 'document_number, moodle_course_id', 'external_id')
  const alumnosPorAula = new Map<number, Set<string>>()
  for (const n of notas as { document_number: string | null; moodle_course_id: string | null }[]) {
    if (!n.moodle_course_id || !n.document_number) continue
    const k = Number(n.moodle_course_id)
    if (!alumnosPorAula.has(k)) alumnosPorAula.set(k, new Set())
    alumnosPorAula.get(k)!.add(String(n.document_number))
  }

  const aulaOf = new Map<number, { shortname: string | null; matriculados: number }>()
  for (const a of aulas) aulaOf.set(Number(a.aula_id), { shortname: a.shortname, matriculados: Number(a.matriculados ?? 0) })

  const resumen = cols.map((c: { id: string; program_id: string; name: string; language: string | null; partner: string | null; suffix: string | null; active: boolean }) => {
    const malla = courses.filter((x: { program_id: string | null }) => x.program_id === c.program_id)
    const suyas = links.filter((l: { collection_id: string | null }) => l.collection_id === c.id)
    const llenas = new Set(suyas.map((l: { course_id: string | null }) => String(l.course_id)))
    return {
      ...c,
      programa: nombrePrograma.get(c.program_id) ?? c.program_id,
      category_id: catDe.get(c.program_id)?.id ?? null,
      categoria: catDe.get(c.program_id)?.name ?? null,
      asignaturas: malla.length,
      con_aula: malla.filter((x: { id: string }) => llenas.has(x.id)).length,
      sincronizando: suyas.filter((l: { sync_enabled: boolean }) => l.sync_enabled).length,
      // La suma de matriculados de sus aulas: útil para dimensionar el campus,
      // pero cuenta a cada alumno una vez por asignatura.
      matriculas_en_aulas: suyas.reduce((s: number, l: { aula_id: number }) => s + (aulaOf.get(Number(l.aula_id))?.matriculados ?? 0), 0),
      alumnos: alumnosDe.get(c.id)?.size ?? 0,
      // Personas distintas dentro de sus aulas, sin duplicar por asignatura.
      alumnos_en_aulas: (() => {
        const u = new Set<string>()
        for (const l of suyas as { aula_id: number }[]) {
          for (const d of alumnosPorAula.get(Number(l.aula_id)) ?? []) u.add(d)
        }
        return u.size
      })(),
      alumnos_activos: activosDe.get(c.id)?.size ?? 0,
    }
  })

  // -------------------------------------------------------------------------
  // ?vista=programas-libres → programas sin ninguna colección.
  //
  // Se excluyen a propósito los de CAMPUS EXTERNO: esos se venden pero no se
  // dictan en nuestro Moodle, así que no deben tener colección y aparecerían
  // como pendientes para siempre. Se cuentan aparte para que se vea que la
  // exclusión es deliberada y no un olvido.
  // -------------------------------------------------------------------------
  if (req.nextUrl.searchParams.get('vista') === 'programas-libres') {
    const conColeccion = new Set(cols.map((c: { program_id: string }) => c.program_id))
    const asignaturasDe = new Map<string, number>()
    for (const c of courses as { program_id: string | null }[]) {
      if (!c.program_id) continue
      asignaturasDe.set(c.program_id, (asignaturasDe.get(c.program_id) ?? 0) + 1)
    }
    const alumnosDePrograma = new Map<string, Set<string>>()
    for (const m of matriculas as { student_id: string; program_id?: string; status: string | null }[]) {
      const pid = (m as { program_id?: string }).program_id
      if (!pid) continue
      if (!alumnosDePrograma.has(pid)) alumnosDePrograma.set(pid, new Set())
      alumnosDePrograma.get(pid)!.add(m.student_id)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todos = (programs as any[]).filter(p => !conColeccion.has(p.id))
    const externos = todos.filter(p => p.partner_campus)
    const libres = todos.filter(p => !p.partner_campus).map(p => ({
      program_id: p.id,
      programa: p.name,
      categoria: p.category?.name ?? null,
      category_id: p.category?.id ?? null,
      asignaturas: asignaturasDe.get(p.id) ?? 0,
      estudiantes: alumnosDePrograma.get(p.id)?.size ?? 0,
    })).sort((a, b) => b.estudiantes - a.estudiantes || String(a.programa).localeCompare(String(b.programa)))

    return NextResponse.json({
      total: libres.length,
      con_estudiantes: libres.filter(p => p.estudiantes > 0).length,
      estudiantes: libres.reduce((s, p) => s + p.estudiantes, 0),
      excluidos_campus_externo: externos.length,
      programas: libres,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      campus_externo: externos.map((p: any) => ({ program_id: p.id, programa: p.name, categoria: p.category?.name ?? null })),
    })
  }

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

  // Todas las aulas libres del campus, para las casillas cuyo código no coincide
  // con ninguna. Pasa cuando el campus y la malla nombran distinto la misma
  // asignatura: el aula se llama "ACC 260 - Principios de Contabilidad
  // Financiera" y en la malla es "FIN 260 - Principles of Financial
  // Accounting". Sin esta lista esa casilla sería imposible de llenar.
  const libres = aulas
    .filter((a: { aula_id: number }) => !ocupadas.has(Number(a.aula_id)))
    .map((a: { aula_id: number; shortname: string | null; matriculados: number }) => ({
      aula_id: Number(a.aula_id), shortname: a.shortname, matriculados: Number(a.matriculados ?? 0),
    }))
    .sort((x: { matriculados: number }, y: { matriculados: number }) => y.matriculados - x.matriculados)

  return NextResponse.json({
    coleccion: { ...col, programa: nombrePrograma.get(col.program_id) ?? col.program_id },
    casillas, libres,
    con_aula: casillas.filter((c: { aula: unknown }) => c.aula).length,
    total: casillas.length,
  })
}

// ---------------------------------------------------------------------------
// POST — acciones sobre colecciones
//   { accion:'crear',  program_id, name, language?, partner?, suffix? }
//   { accion:'editar',   collection_id, name?, language?, partner?, suffix? }
//   { accion:'eliminar', collection_id }  ← sólo si está vacía
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

  if (b.accion === 'editar') {
    if (!b.collection_id) return NextResponse.json({ error: 'Falta la colección' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim()
    if (b.language !== undefined) patch.language = b.language || null
    if (b.suffix !== undefined) patch.suffix = b.suffix || null
    if (b.partner !== undefined) patch.partner = b.partner || null
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })
    const { error } = await sb.from('moodle_collections').update(patch).eq('id', b.collection_id)
    if (error) {
      // El nombre es único dentro del programa: dos colecciones Upgrade en el
      // mismo bachelor serían indistinguibles para quien matricula.
      const dup = /duplicate|unique/i.test(error.message)
      return NextResponse.json({ error: dup ? 'Ya existe una colección con ese nombre en el programa' : error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  // Borrar una colección sólo si está vacía por los dos lados: sin aulas en sus
  // casillas y sin matrículas que la señalen. Una colección con matrículas
  // dejaría a esos estudiantes apuntando a algo que ya no existe, y una con
  // aulas perdería el trabajo de haberlas colocado.
  if (b.accion === 'eliminar') {
    if (!b.collection_id) return NextResponse.json({ error: 'Falta la colección' }, { status: 400 })

    const { count: conAulas } = await sb.from('moodle_course_links')
      .select('aula_id', { count: 'exact', head: true }).eq('collection_id', b.collection_id)
    if (conAulas) {
      return NextResponse.json({
        error: `No se puede borrar: tiene ${conAulas} aula${conAulas > 1 ? 's' : ''} en sus casillas. Quítalas primero.`,
      }, { status: 409 })
    }

    const { count: conMatriculas } = await sb.from('academic_student_enrollments')
      .select('id', { count: 'exact', head: true }).eq('collection_id', b.collection_id)
    if (conMatriculas) {
      return NextResponse.json({
        error: `No se puede borrar: ${conMatriculas} matrícula${conMatriculas > 1 ? 's' : ''} la tienen elegida. Habría que reasignarlas antes.`,
      }, { status: 409 })
    }

    const { error } = await sb.from('moodle_collections').delete().eq('id', b.collection_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, eliminada: true })
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

    // El capstone no se sincroniza nunca, y encender la colección entera es
    // justo por donde volvería a encenderse sin que nadie lo decidiera. Su aula
    // sigue vinculada —el estudiante entra igual—; lo que no hace es traer notas.
    let capstone = 0
    if (on) {
      const { data: caps } = await sb.from('academic_courses').select('id').eq('is_capstone', true)
      const ids = (caps ?? []).map((c: { id: string }) => String(c.id))
      if (ids.length) {
        const { data: apagadas } = await sb.from('moodle_course_links')
          .update({ sync_enabled: false, sync_enabled_by: quien, sync_enabled_at: ahora })
          .eq('collection_id', b.collection_id).eq('kind', 'asignatura')
          .in('course_id', ids).select('aula_id')
        capstone = (apagadas ?? []).length
      }
    }
    return NextResponse.json({ ok: true, aulas: (count ?? 0) - capstone, sincronizando: on, capstone_excluidas: capstone })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
