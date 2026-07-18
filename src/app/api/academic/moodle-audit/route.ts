import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured } from '@/lib/moodle'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// Auditor del Campus.
//
// Política institucional: en cada aula, las ponderaciones de PRIMER NIVEL
// (ítems y categorías colgando directo del curso) deben sumar 100%, y el total
// del curso debe estar en escala sobre 100. Las aulas se reutilizan entre
// cohortes y cambian: esta auditoría detecta cuándo dejaron de cumplir.
//
// GET  → última foto guardada + resumen
// POST → barre Moodle aula por aula y guarda la foto (toma 1-3 minutos)
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('moodle_aula_audit').select('*').order('shortname').range(from, from + 999)
    if (error) return NextResponse.json({ error: 'Falta correr supabase/moodle_audit.sql: ' + error.message }, { status: 400 })
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < 1000) break
  }
  const conDatos = rows.filter(r => !r.error)
  return NextResponse.json({
    audited_at: rows[0]?.audited_at ?? null,
    total: rows.length,
    cumplen: conDatos.filter(r => r.cumple_pesos && r.cumple_escala).length,
    pesos_mal: conDatos.filter(r => r.cumple_pesos === false).length,
    escala_mal: conDatos.filter(r => r.cumple_escala === false).length,
    sin_datos: rows.filter(r => r.error).length,
    vinculadas: rows.filter(r => r.linked_course).length,
    aulas: rows,
  })
}

export async function POST() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })
  const sb = db()

  const courses = await moodleCall('core_course_get_courses', {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aulas = ((Array.isArray(courses) ? courses : []) as any[]).filter(c => c.format !== 'site')

  // Vínculos aula → asignatura del ERP
  const { data: offs } = await sb.from('semester_offerings')
    .select('moodle_course_id, course:academic_courses(code, name)').not('moodle_course_id', 'is', null)
  const linkedBy = new Map<number, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (offs ?? []) as any[]) {
    if (o.course) linkedBy.set(Number(o.moodle_course_id), `${o.course.code ?? ''} · ${o.course.name ?? ''}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditOne = async (c: any): Promise<Record<string, unknown>> => {
    const base = {
      aula_id: c.id, shortname: c.shortname, fullname: c.fullname,
      visible: c.visible !== 0, linked_course: linkedBy.get(Number(c.id)) ?? null,
      audited_at: new Date().toISOString(),
    }
    try {
      // Recursos: módulos del contenido del aula
      let recursos = 0
      try {
        const contents = await moodleCall('core_course_get_contents', { courseid: c.id })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const sec of (Array.isArray(contents) ? contents : []) as any[]) recursos += (sec.modules ?? []).length
      } catch { /* algunas aulas no exponen contenido */ }

      // Un alumno cualquiera para leer la estructura de calificaciones
      const enrolled = await moodleCall('core_enrol_get_enrolled_users', {
        courseid: c.id, options: [{ name: 'limitnumber', value: 1 }],
      })
      const first = Array.isArray(enrolled) && enrolled.length ? enrolled[0] : null
      if (!first) {
        return { ...base, recursos, items_evaluacion: null, items_con_peso: null, suma_pesos: null, escala_total: null, cumple_pesos: null, cumple_escala: null, error: 'sin matriculados' }
      }
      const rep = await moodleCall('gradereport_user_get_grade_items', { courseid: c.id, userid: first.id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (rep?.usergrades?.[0]?.gradeitems ?? []) as any[]
      const courseItem = items.find(i => i.itemtype === 'course')
      const rootId = courseItem?.iteminstance ?? null
      const mods = items.filter(i => i.itemtype === 'mod')
      const conPeso = mods.filter(i => (i.weightraw ?? 0) > 0)
      // Primer nivel: lo que cuelga directo de la categoría raíz (ítems y categorías)
      const topLevel = items.filter(i => i.itemtype !== 'course' && i.categoryid === rootId)
      const sumaPesos = topLevel.length
        ? Math.round(topLevel.reduce((s, i) => s + (Number(i.weightraw) || 0), 0) * 10000) / 100
        : null
      const escala = courseItem?.grademax != null ? Number(courseItem.grademax) : null
      return {
        ...base, recursos,
        items_evaluacion: mods.length,
        items_con_peso: conPeso.length,
        suma_pesos: sumaPesos,
        escala_total: escala,
        cumple_pesos: sumaPesos == null ? null : Math.abs(sumaPesos - 100) <= 0.5,
        cumple_escala: escala == null ? null : escala === 100,
        error: null,
      }
    } catch (e) {
      return { ...base, recursos: null, items_evaluacion: null, items_con_peso: null, suma_pesos: null, escala_total: null, cumple_pesos: null, cumple_escala: null, error: e instanceof Error ? e.message.slice(0, 120) : 'error' }
    }
  }

  // En tandas para no exceder el tiempo (3 llamadas por aula)
  const resultados: Record<string, unknown>[] = []
  for (let i = 0; i < aulas.length; i += 6) {
    const tanda = await Promise.all(aulas.slice(i, i + 6).map(auditOne))
    resultados.push(...tanda)
  }

  for (let i = 0; i < resultados.length; i += 200) {
    const { error } = await sb.from('moodle_aula_audit').upsert(resultados.slice(i, i + 200), { onConflict: 'aula_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, auditadas: resultados.length })
}
