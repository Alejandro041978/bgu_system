import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { importAula } from '@/lib/moodle-import'
import { moodleConfigured } from '@/lib/moodle'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Sincronización a demanda POR ASIGNATURA.
//
// El cron recorre las 585 aulas vinculadas de 43 en 43, así que una vuelta
// completa tarda unas catorce horas. Sirve para mantener el expediente al día,
// pero no para trabajar: Registros vacía una nota, quiere ver la verdadera, y
// tiene que esperar a mañana.
//
// La importación manual ya existía, pero se entra por NÚMERO DE AULA — un dato
// que quien atiende a un estudiante no tiene a mano. Aquí se entra por la
// asignatura, que es como se piensa el problema, y se importan de una vez
// todas sus aulas.

// GET → catálogo para los filtros: categorías, programas y asignaturas con su
// número de aulas vinculadas.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  // ?student_q= → buscador de estudiante para sincronizar a UNA persona
  const sq = (req.nextUrl.searchParams.get('student_q') ?? '').trim()
  if (sq) {
    if (sq.length < 3) return NextResponse.json({ students: [] })
    const t = sq.replace(/[%,()]/g, ' ')
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number')
      .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,second_last_name.ilike.%${t}%,document_number.ilike.%${t}%`)
      .limit(12)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ students: ((data ?? []) as any[]).map(x => ({
      id: x.id, documento: x.document_number,
      nombre: [x.first_name, x.last_name, x.second_last_name].filter(Boolean).join(' '),
    })) })
  }

  const programId = req.nextUrl.searchParams.get('program_id')
  if (!programId) {
    const [{ data: cats }, { data: progs }] = await Promise.all([
      sb.from('academic_programs_category').select('id, name').order('name'),
      sb.from('academic_programs').select('id, name, category_id').order('name'),
    ])
    return NextResponse.json({ categories: cats ?? [], programs: progs ?? [] })
  }

  const { data: courses } = await sb.from('academic_courses')
    .select('id, code, name, credits').eq('program_id', programId).order('code')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = ((courses ?? []) as any[]).map(c => c.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let links: any[] = []
  if (ids.length) {
    const { data } = await sb.from('moodle_course_links')
      .select('course_id, aula_id, sync_enabled, collection_id').in('course_id', ids)
      .eq('kind', 'asignatura').is('replaced_at', null)
    links = data ?? []
  }
  const aulasDe = new Map<string, number[]>()
  for (const l of links) {
    const a = aulasDe.get(l.course_id) ?? []
    a.push(Number(l.aula_id)); aulasDe.set(l.course_id, a)
  }

  // Última vez que cada aula se intentó, y si el Auditor la dejó importable.
  const todasAulas = [...new Set(links.map(l => Number(l.aula_id)))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aud = new Map<number, any>()
  for (let i = 0; i < todasAulas.length; i += 200) {
    const { data } = await sb.from('moodle_aula_audit')
      .select('aula_id, shortname, matriculados, reject_reason, last_import_at, suma_coeficientes').in('aula_id', todasAulas.slice(i, i + 200))
    for (const a of data ?? []) aud.set(Number(a.aula_id), a)
  }

  // La sincronización manual es POR ASIGNATURA/COLECCIÓN (regla del usuario,
  // 17/09/2026): el cron ya pasa por todas; quien sincroniza a mano tiene una
  // necesidad con UNA colección —o con un alumno—, no con las cuatro.
  const colIds = [...new Set(links.map(l => l.collection_id).filter(Boolean))]
  const colName = new Map<string, string>()
  if (colIds.length) {
    const { data: cols } = await sb.from('moodle_collections').select('id, name').in('id', colIds)
    for (const c of cols ?? []) colName.set(String(c.id), String(c.name))
  }
  const detalleDe = new Map<string, Record<string, unknown>[]>()
  for (const l of links) {
    const a = aud.get(Number(l.aula_id))
    const d = detalleDe.get(l.course_id) ?? []
    d.push({
      aula: Number(l.aula_id),
      coleccion: l.collection_id ? (colName.get(String(l.collection_id)) ?? null) : null,
      shortname: a?.shortname ?? null,
      matriculados: a?.matriculados ?? null,
      ultima: a?.last_import_at ?? null,
      rechazo: a?.reject_reason ?? (a?.suma_coeficientes == null ? 'sin auditoría de ponderaciones' : null),
      sync_enabled: !!l.sync_enabled,
    })
    detalleDe.set(l.course_id, d)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((courses ?? []) as any[]).map(c => {
    const aulas = (aulasDe.get(c.id) ?? []).sort((a, b) => a - b)
    const ultimas = aulas.map(a => aud.get(a)?.last_import_at).filter(Boolean).sort()
    // Un aula sin ponderaciones auditadas la rechaza el importador entera. Se
    // avisa AQUÍ y no al pulsar: quien mira la lista ya sabe cuál va a fallar.
    const sinAuditar = aulas.filter(a => aud.get(a)?.suma_coeficientes == null)
    return {
      ...c, aulas,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      colecciones: (detalleDe.get(c.id) ?? []).sort((x: any, y: any) => String(x.coleccion ?? '').localeCompare(String(y.coleccion ?? '')) || x.aula - y.aula),
      ultima_sincronizacion: ultimas.length ? ultimas[ultimas.length - 1] : null,
      aulas_sin_auditar: sinAuditar,
    }
  })
  return NextResponse.json({ courses: rows })
}

// POST { course_id, aula_id, student_id? } → importa UNA aula (una colección de
// la asignatura) y, si se indica, solo a ESE estudiante.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no está configurado' }, { status: 400 })

  const b = await req.json().catch(() => null) as { course_id?: string; aula_id?: number; student_id?: string } | null
  const aula = Number(b?.aula_id)
  if (!b?.course_id || !isFinite(aula)) return NextResponse.json({ error: 'Faltan course_id y aula_id' }, { status: 400 })
  const sb = db()

  // El botón elige entre aulas VINCULADAS a esa asignatura; no autoriza otras.
  const { data: link } = await sb.from('moodle_course_links')
    .select('aula_id').eq('course_id', b.course_id).eq('aula_id', aula).eq('kind', 'asignatura').is('replaced_at', null).limit(1)
  if (!(link ?? []).length) return NextResponse.json({ error: `El aula ${aula} no está vinculada a esta asignatura` }, { status: 409 })

  const started = Date.now()
  let resultado: Record<string, unknown>
  try {
    const r = await importAula(sb, aula, user.id, {
      deadlineMs: started + 240_000, // las consultas paran ~45 s antes: escribir un aula grande toma ~80 s y el tope es 300
      ...(b.student_id ? { onlyStudentIds: [String(b.student_id)] } : {}),
    })
    if (!r.ok) resultado = { aula, estado: 'rechazada', detalle: r.error }
    else {
      const s = r.summary
      resultado = {
        aula, estado: 'importada',
        nuevas: s.inserted, actualizadas: s.updated, sin_cambio: s.unchanged,
        protegidas: s.protected_rows, cerradas: s.locked_rows,
        sin_puente: s.sin_puente, sin_total: s.sin_total, parcial: s.parcial ?? null,
      }
      // Misma huella que deja el cron: la lista muestra cuándo se intentó.
      if (!b.student_id) await sb.from('moodle_aula_audit').update({ last_import_at: new Date().toISOString() }).eq('aula_id', aula)
    }
  } catch (e) {
    resultado = { aula, estado: 'error', detalle: e instanceof Error ? e.message : String(e) }
  }
  return NextResponse.json({ ok: true, resultado, duracion_s: Math.round((Date.now() - started) / 1000) })
}
