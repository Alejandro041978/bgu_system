import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { inferirAlias, proponer, type AulaAudit, type CursoMalla } from '@/lib/moodle-links'
import { courseNameKey } from '@/lib/course-match'

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
// GET → propone qué asignatura del plan enseña cada aula del campus.
//
// Sólo propone: no escribe nada. El objetivo es ver la calidad de la propuesta
// antes de confirmar 300 vínculos.
//
// ?solo=pendientes (por omisión) | todas
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const sb = db()
  const solo = req.nextUrl.searchParams.get('solo') ?? 'pendientes'

  const aulas = await todo(sb, 'moodle_aula_audit', 'aula_id, shortname, matriculados, categoria', 'aula_id') as AulaAudit[]
  const courses = await todo(sb, 'academic_courses', 'id, program_id, name, code', 'id') as CursoMalla[]
  const programs = await todo(sb, 'academic_programs', 'id, name', 'id')
  const nombrePrograma = new Map<string, string>(programs.map((p: { id: string; name: string }) => [p.id, p.name]))
  const nombreCurso = new Map<string, string>(courses.map(c => [c.id, `${c.code ?? ''} · ${c.name ?? ''}`.trim()]))

  // Vínculos ya establecidos: primero la tabla nueva, y como puente el enlace
  // viejo de la oferta formativa, que sigue siendo válido hasta que se migre.
  const links = await todo(sb, 'moodle_course_links', 'aula_id, course_id, kind, sync_enabled, collection_id', 'aula_id')
    .catch(() => [] as { aula_id: number; course_id: string | null; kind: string }[])
  const yaVinculada = new Map<number, { course_id: string | null; kind: string; sync_enabled: boolean }>()
  for (const l of links) yaVinculada.set(Number(l.aula_id), { course_id: l.course_id, kind: l.kind, sync_enabled: !!l.sync_enabled })

  const offs = await todo(sb, 'semester_offerings', 'moodle_course_id, course_id', 'id')
  const legado = new Map<number, string>()
  for (const o of offs) {
    if (o.moodle_course_id != null) legado.set(Number(o.moodle_course_id), o.course_id)
  }

  // Lo ya decidido: primero la tabla nueva, y si no, el enlace viejo de la
  // oferta. Alimenta la deducción del sufijo y sirve de contraste.
  const decidido = new Map<number, string>()
  for (const [id, c] of legado) decidido.set(id, c)
  for (const [id, v] of yaVinculada) { if (v.course_id) decidido.set(id, v.course_id) }

  const alias = inferirAlias(aulas, courses, decidido)
  const propuestas = proponer(aulas, courses, alias, courseNameKey)

  const filas = propuestas.map(p => {
    const ya = yaVinculada.get(p.aula_id)
    const viejo = legado.get(p.aula_id) ?? null
    return {
      ...p,
      programa: p.program_id ? (nombrePrograma.get(p.program_id) ?? null) : null,
      estado: ya ? (ya.kind === 'no_curricular' ? 'no_curricular' : 'vinculada')
            : viejo ? 'vinculada_por_oferta' : 'pendiente',
      course_id_actual: ya?.course_id ?? viejo,
      sync_enabled: ya?.sync_enabled ?? false,
    }
  })

  // -------------------------------------------------------------------------
  // ?vista=libres → las aulas del campus que no están en ninguna colección.
  //
  // Son las que todavía no pertenecen a ningún programa: unas porque nadie las
  // ha colocado, otras porque no son asignaturas (inducción, demos, encuestas)
  // y otras porque su código no existe en ninguna malla. La lista dice de cuál
  // se trata en cada caso, para que se puedan ir vaciando.
  // -------------------------------------------------------------------------
  if (req.nextUrl.searchParams.get('vista') === 'libres') {
    const enColeccion = new Set<number>()
    for (const l of links) { if (l.collection_id) enColeccion.add(Number(l.aula_id)) }
    const libres = filas
      .filter(f => !enColeccion.has(f.aula_id))
      .map(f => ({
        aula_id: f.aula_id, shortname: f.shortname, matriculados: f.matriculados,
        code: f.code, sufijo: f.sufijo,
        propuesta: f.course_name, programa: f.programa, confianza: f.confianza,
        familia: f.familia, motivo: f.motivo,
        // Sabemos qué asignatura enseña aunque no esté en ninguna colección:
        // viene del enlace viejo de la oferta o de la propuesta.
        identificada: !!(f.course_id_actual ?? f.course_id),
        no_curricular: f.estado === 'no_curricular',
      }))
      .sort((a, b) => b.matriculados - a.matriculados)
    return NextResponse.json({
      total: libres.length,
      con_alumnos: libres.filter(a => a.matriculados > 0).length,
      matriculas: libres.reduce((s, a) => s + a.matriculados, 0),
      identificadas: libres.filter(a => a.identificada).length,
      aulas: libres,
    })
  }

  // -------------------------------------------------------------------------
  // ?vista=cobertura → el inventario al revés: para cada asignatura del plan,
  // qué aulas la enseñan.
  //
  // Es la foto de la herencia. La misma asignatura suele tener una aula por
  // modalidad —upgrade, regular, campus asociado— más la plantilla original
  // vacía, y hay asignaturas sin ninguna aula: esas no pueden calificar a
  // nadie, por más que el estudiante esté matriculado.
  // -------------------------------------------------------------------------
  if (req.nextUrl.searchParams.get('vista') === 'cobertura') {
    const modalidad = (sn: string | null): string => {
      const s = String(sn ?? '')
      if (/\bUP\b/i.test(s)) return 'upgrade'
      if (/\bCVC\b/i.test(s)) return 'campus asociado'
      return 'regular'
    }
    // Aula → asignatura: lo ya decidido manda; si no, la propuesta.
    const porCurso = new Map<string, typeof filas>()
    for (const f of filas) {
      const cid = f.course_id_actual ?? f.course_id
      if (!cid) continue
      if (!porCurso.has(String(cid))) porCurso.set(String(cid), [])
      porCurso.get(String(cid))!.push(f)
    }
    const cursosDe = new Map<string, CursoMalla[]>()
    for (const c of courses) {
      const p = String(c.program_id ?? 'sin-programa')
      if (!cursosDe.has(p)) cursosDe.set(p, [])
      cursosDe.get(p)!.push(c)
    }
    const pedido = req.nextUrl.searchParams.get('programa')

    const programas = [...cursosDe.entries()].map(([pid, cs]) => {
      const detalle = cs.map(c => {
        const as = (porCurso.get(c.id) ?? []).map(f => ({
          aula_id: f.aula_id, shortname: f.shortname,
          modalidad: modalidad(f.shortname),
          matriculados: f.matriculados,
          sync_enabled: f.sync_enabled,
          estado: f.estado,
        })).sort((a, b) => b.matriculados - a.matriculados)
        return {
          course_id: c.id, code: c.code, name: c.name,
          aulas: as.length,
          matriculas: as.reduce((s, x) => s + x.matriculados, 0),
          sincronizando: as.filter(x => x.sync_enabled).length,
          alerta: as.length === 0 ? 'sin ninguna aula'
                : as.every(x => x.matriculados === 0) ? 'todas sus aulas están vacías'
                : as.some(x => x.matriculados > 0) && !as.some(x => x.sync_enabled) ? 'tiene alumnos y ninguna aula sincroniza'
                : null,
          detalle: as,
        }
      }).sort((a, b) => String(a.code).localeCompare(String(b.code)))

      return {
        program_id: pid,
        programa: nombrePrograma.get(pid) ?? pid,
        asignaturas: cs.length,
        aulas: detalle.reduce((s, c) => s + c.aulas, 0),
        matriculas: detalle.reduce((s, c) => s + c.matriculas, 0),
        sin_ninguna_aula: detalle.filter(c => c.aulas === 0).length,
        con_alumnos_sin_sincronizar: detalle.filter(c => c.alerta === 'tiene alumnos y ninguna aula sincroniza').length,
        // El detalle sólo del programa pedido: son 432 asignaturas en total.
        cursos: pedido && pedido === pid ? detalle : undefined,
      }
    }).sort((a, b) => b.matriculas - a.matriculas)

    return NextResponse.json({ programas })
  }

  const pendientes = filas.filter(f => f.estado === 'pendiente')
  const lista = (solo === 'todas' ? filas : pendientes).sort((a, b) => b.matriculados - a.matriculados)
  const detalle = req.nextUrl.searchParams.get('detalle') === '1'
  const conf = (c: string) => pendientes.filter(f => f.confianza === c)
  const fam = (f: string) => pendientes.filter(p => p.familia === f)
  const resumir = (rs: typeof pendientes) => ({
    aulas: rs.length,
    con_alumnos: rs.filter(r => r.matriculados > 0).length,
    matriculas: rs.reduce((s, r) => s + r.matriculados, 0),
  })

  // Los códigos que no existen en ninguna malla, agrupados: si un programa
  // entero aparece acá, no es un error de tipeo — es un plan que falta cargar.
  const desconocidos = new Map<string, { code: string; sufijo: string | null; aulas: number; alumnos: number }>()
  for (const f of fam('codigo_desconocido')) {
    const k = String(f.code)
    if (!desconocidos.has(k)) desconocidos.set(k, { code: k, sufijo: f.sufijo, aulas: 0, alumnos: 0 })
    const d = desconocidos.get(k)!
    d.aulas++; d.alumnos += f.matriculados
  }

  return NextResponse.json({
    aulas_del_campus: aulas.length,
    ya_vinculadas: filas.filter(f => f.estado !== 'pendiente').length,
    sincronizando: filas.filter(f => f.sync_enabled).length,
    pendientes: resumir(pendientes),
    listas_para_vincular: { alta: resumir(conf('alta')), media: resumir(conf('media')) },
    sin_propuesta: {
      no_es_asignatura: resumir(fam('no_es_asignatura')),
      codigo_desconocido: resumir(fam('codigo_desconocido')),
      codigo_ambiguo: resumir(fam('codigo_ambiguo')),
    },
    alias_deducidos: [...alias.entries()].map(([sufijo, pid]) => ({ sufijo, programa: nombrePrograma.get(pid) ?? pid })),
    codigos_sin_malla: [...desconocidos.values()].sort((a, b) => b.alumnos - a.alumnos || b.aulas - a.aulas),
    ambiguas: fam('codigo_ambiguo').map(f => ({ aula_id: f.aula_id, shortname: f.shortname, matriculados: f.matriculados, motivo: f.motivo })),
    // Contraste contra lo ya decidido: aulas donde mi propuesta NO coincide con
    // el vínculo que ya existe. Cada una es un error de alguno de los dos lados
    // y hay que mirarla; no se toca nada automáticamente.
    discrepancias: filas
      .filter(f => f.course_id_actual && f.course_id && f.course_id !== f.course_id_actual)
      .map(f => ({
        aula_id: f.aula_id, shortname: f.shortname, matriculados: f.matriculados,
        vinculada_hoy_a: nombreCurso.get(String(f.course_id_actual)) ?? f.course_id_actual,
        yo_propongo: f.course_name, confianza: f.confianza, motivo: f.motivo,
      })),
    // La lista completa sólo bajo pedido: son cientos de filas.
    aulas: detalle ? lista : lista.slice(0, 15),
  })
}

// ---------------------------------------------------------------------------
// POST { vinculos: [{ aula_id, course_id }] } → confirma vínculos
//       { no_curriculares: [aula_id] }        → aulas que no son asignaturas
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const sb = db()
  const quien = g.user.email ?? g.user.id
  const ahora = new Date().toISOString()
  const filas: Record<string, unknown>[] = []

  // ?aplicar=alta|media → confirma de una vez todas las propuestas de esa
  // confianza que sigan pendientes, sin tener que armar el JSON a mano. Se
  // recalcula acá: no se confía en una lista que el navegador tenga vieja.
  const aplicar = req.nextUrl.searchParams.get('aplicar')

  // ?aplicar=oferta → trae a la tabla nueva los vínculos que hoy viven en
  // semester_offerings. Esos SÍ nacen sincronizando: es exactamente el conjunto
  // que el cron ya recorre, así que la migración no cambia nada en marcha.
  if (aplicar === 'oferta') {
    const offs = await todo(sb, 'semester_offerings', 'moodle_course_id, course_id', 'id')
    const yaLink = await todo(sb, 'moodle_course_links', 'aula_id', 'aula_id')
    const ya = new Set(yaLink.map((l: { aula_id: number }) => Number(l.aula_id)))
    const vistos = new Set<number>()
    for (const o of offs) {
      const id = Number(o.moodle_course_id)
      if (!o.moodle_course_id || !o.course_id || ya.has(id) || vistos.has(id)) continue
      vistos.add(id)
      filas.push({
        aula_id: id, course_id: o.course_id, kind: 'asignatura',
        sync_enabled: true, sync_enabled_by: quien, sync_enabled_at: ahora,
        linked_by: quien, linked_at: ahora, nota: 'Migrada desde la oferta formativa',
      })
    }
    if (!filas.length) return NextResponse.json({ ok: true, guardados: 0, nota: 'No quedan vínculos de oferta por migrar' })
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await sb.from('moodle_course_links').upsert(filas.slice(i, i + 500), { onConflict: 'aula_id' })
      if (error) return NextResponse.json({ error: error.message, guardados: i }, { status: 500 })
    }
    return NextResponse.json({ ok: true, migradas_desde_la_oferta: filas.length, sincronizando: filas.length })
  }

  // ?sincronizar=1,2,3 | ?apagar=1,2,3 → enciende o apaga la importación de
  // esas aulas. Es una decisión aparte de la identidad, y siempre explícita.
  const encender = req.nextUrl.searchParams.get('sincronizar')
  const apagar = req.nextUrl.searchParams.get('apagar')
  if (encender || apagar) {
    const ids = String(encender ?? apagar).split(',').map(n => Number(n.trim())).filter(n => n > 0)
    if (!ids.length) return NextResponse.json({ error: 'No se recibió ninguna aula' }, { status: 400 })
    const { error, count } = await sb.from('moodle_course_links')
      .update(encender
        ? { sync_enabled: true, sync_enabled_by: quien, sync_enabled_at: ahora }
        : { sync_enabled: false, sync_enabled_by: quien, sync_enabled_at: ahora },
        { count: 'exact' })
      .in('aula_id', ids).eq('kind', 'asignatura')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, [encender ? 'sincronizando' : 'apagadas']: count ?? ids.length })
  }

  if (aplicar === 'alta' || aplicar === 'media') {
    const aulas = await todo(sb, 'moodle_aula_audit', 'aula_id, shortname, matriculados, categoria', 'aula_id') as AulaAudit[]
    const courses = await todo(sb, 'academic_courses', 'id, program_id, name, code', 'id') as CursoMalla[]
    const yaLink = await todo(sb, 'moodle_course_links', 'aula_id, course_id', 'aula_id')
    const ya = new Set(yaLink.map((l: { aula_id: number }) => Number(l.aula_id)))
    const offs = await todo(sb, 'semester_offerings', 'moodle_course_id, course_id', 'id')
    const decidido = new Map<number, string>()
    for (const o of offs) { if (o.moodle_course_id != null) decidido.set(Number(o.moodle_course_id), o.course_id) }
    for (const l of yaLink) { if (l.course_id) decidido.set(Number(l.aula_id), l.course_id) }
    const props = proponer(aulas, courses, inferirAlias(aulas, courses, decidido), courseNameKey)
    for (const p of props) {
      if (p.confianza !== aplicar || !p.course_id || ya.has(p.aula_id)) continue
      filas.push({ aula_id: p.aula_id, course_id: p.course_id, kind: 'asignatura', linked_by: quien, linked_at: ahora })
    }
    if (!filas.length) return NextResponse.json({ ok: true, guardados: 0, nota: `No quedan propuestas de confianza ${aplicar} sin vincular` })
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await sb.from('moodle_course_links').upsert(filas.slice(i, i + 500), { onConflict: 'aula_id' })
      if (error) return NextResponse.json({ error: error.message, guardados: i }, { status: 500 })
    }
    return NextResponse.json({ ok: true, confianza: aplicar, guardados: filas.length })
  }

  const body = await req.json().catch(() => null) as {
    vinculos?: { aula_id: number; course_id: string }[]
    no_curriculares?: number[]
  } | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  for (const v of body.vinculos ?? []) {
    if (!v?.aula_id || !v?.course_id) continue
    filas.push({ aula_id: Number(v.aula_id), course_id: v.course_id, kind: 'asignatura', linked_by: quien, linked_at: ahora })
  }
  for (const id of body.no_curriculares ?? []) {
    if (!id) continue
    filas.push({ aula_id: Number(id), course_id: null, kind: 'no_curricular', linked_by: quien, linked_at: ahora })
  }
  if (!filas.length) return NextResponse.json({ error: 'No se recibió ningún vínculo' }, { status: 400 })

  const { error } = await sb.from('moodle_course_links').upsert(filas, { onConflict: 'aula_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, guardados: filas.length })
}
