import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { inferirAlias, proponer, type AulaAudit, type CursoMalla } from '@/lib/moodle-links'

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

  // Vínculos ya establecidos: primero la tabla nueva, y como puente el enlace
  // viejo de la oferta formativa, que sigue siendo válido hasta que se migre.
  const links = await todo(sb, 'moodle_course_links', 'aula_id, course_id, kind', 'aula_id')
    .catch(() => [] as { aula_id: number; course_id: string | null; kind: string }[])
  const yaVinculada = new Map<number, { course_id: string | null; kind: string }>()
  for (const l of links) yaVinculada.set(Number(l.aula_id), { course_id: l.course_id, kind: l.kind })

  const offs = await todo(sb, 'semester_offerings', 'moodle_course_id, course_id', 'id')
  const legado = new Map<number, string>()
  for (const o of offs) {
    if (o.moodle_course_id != null) legado.set(Number(o.moodle_course_id), o.course_id)
  }

  const alias = inferirAlias(aulas, courses)
  const propuestas = proponer(aulas, courses, alias)

  const filas = propuestas.map(p => {
    const ya = yaVinculada.get(p.aula_id)
    const viejo = legado.get(p.aula_id) ?? null
    return {
      ...p,
      programa: p.program_id ? (nombrePrograma.get(p.program_id) ?? null) : null,
      estado: ya ? (ya.kind === 'no_curricular' ? 'no_curricular' : 'vinculada')
            : viejo ? 'vinculada_por_oferta' : 'pendiente',
      course_id_actual: ya?.course_id ?? viejo,
    }
  })

  const pendientes = filas.filter(f => f.estado === 'pendiente')
  const lista = solo === 'todas' ? filas : pendientes

  return NextResponse.json({
    aulas_del_campus: aulas.length,
    ya_vinculadas: filas.filter(f => f.estado !== 'pendiente').length,
    pendientes: pendientes.length,
    pendientes_con_alumnos: pendientes.filter(f => f.matriculados > 0).length,
    matriculas_en_juego: pendientes.reduce((s, f) => s + f.matriculados, 0),
    propuesta: {
      alta: pendientes.filter(f => f.confianza === 'alta').length,
      media: pendientes.filter(f => f.confianza === 'media').length,
      ninguna: pendientes.filter(f => f.confianza === 'ninguna').length,
    },
    alias_deducidos: [...alias.entries()].map(([sufijo, pid]) => ({ sufijo, programa: nombrePrograma.get(pid) ?? pid })),
    aulas: lista.sort((a, b) => b.matriculados - a.matriculados),
  })
}

// ---------------------------------------------------------------------------
// POST { vinculos: [{ aula_id, course_id }] } → confirma vínculos
//       { no_curriculares: [aula_id] }        → aulas que no son asignaturas
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const body = await req.json().catch(() => null) as {
    vinculos?: { aula_id: number; course_id: string }[]
    no_curriculares?: number[]
  } | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const sb = db()
  const quien = g.user.email ?? g.user.id
  const ahora = new Date().toISOString()
  const filas: Record<string, unknown>[] = []

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
