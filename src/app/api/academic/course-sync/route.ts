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
      .select('course_id, aula_id, sync_enabled').in('course_id', ids)
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
      .select('aula_id, last_import_at, suma_coeficientes').in('aula_id', todasAulas.slice(i, i + 200))
    for (const a of data ?? []) aud.set(Number(a.aula_id), a)
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
      ultima_sincronizacion: ultimas.length ? ultimas[ultimas.length - 1] : null,
      aulas_sin_auditar: sinAuditar,
    }
  })
  return NextResponse.json({ courses: rows })
}

// POST { course_id } → importa TODAS las aulas vinculadas a esa asignatura.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no está configurado' }, { status: 400 })

  const b = await req.json().catch(() => null) as { course_id?: string } | null
  if (!b?.course_id) return NextResponse.json({ error: 'Falta course_id' }, { status: 400 })
  const sb = db()

  const { data: links } = await sb.from('moodle_course_links')
    .select('aula_id').eq('course_id', b.course_id).eq('kind', 'asignatura').is('replaced_at', null)
  const aulas = [...new Set(((links ?? []) as { aula_id: number }[]).map(l => Number(l.aula_id)))].sort((a, b2) => a - b2)
  if (!aulas.length) {
    return NextResponse.json({ error: 'Esta asignatura no tiene aulas vinculadas' }, { status: 409 })
  }

  // En serie y con presupuesto: el reporte de un aula grande tarda minutos, y
  // agotar la función a media importación deja el trabajo hecho a medias sin
  // que nadie sepa por dónde iba.
  const started = Date.now()
  const resultados: Record<string, unknown>[] = []
  let nuevas = 0, actualizadas = 0
  for (const aula of aulas) {
    if (Date.now() - started > 240_000) {
      resultados.push({ aula, estado: 'sin tiempo', detalle: 'quedó para la próxima: vuelve a pulsar Sincronizar' })
      continue
    }
    try {
      const r = await importAula(sb, aula, user.id, { deadlineMs: started + 250_000 })
      if (!r.ok) {
        resultados.push({ aula, estado: 'rechazada', detalle: r.error })
        continue
      }
      const s = r.summary
      nuevas += s.inserted; actualizadas += s.updated
      resultados.push({
        aula, estado: 'importada',
        nuevas: s.inserted, actualizadas: s.updated, sin_cambio: s.unchanged,
        protegidas: s.protected_rows, cerradas: s.locked_rows,
      })
    } catch (e) {
      resultados.push({ aula, estado: 'error', detalle: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ ok: true, aulas: aulas.length, nuevas, actualizadas, resultados })
}
