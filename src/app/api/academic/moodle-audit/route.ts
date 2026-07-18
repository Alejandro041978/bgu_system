import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured, MOODLE_STUDENT_ROLEID } from '@/lib/moodle'
import { randomBytes } from 'crypto'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// Auditor del Campus — auditoría ESTRUCTURAL del aula, independiente de
// estudiantes y calificaciones: recursos, cuáles son evaluados, cuáles están
// activos (visibles) y sus ponderaciones. Política: las ponderaciones de
// primer nivel de los recursos evaluados ACTIVOS suman 100% y el total del
// curso está en escala sobre 100. Los recursos ocultos no cuentan.
//
// Moodle solo expone las ponderaciones a través del reporte de un usuario
// matriculado. Para aulas con matriculados se usa el primero; para aulas
// vacías, la cuenta de servicio "Auditor ERP" se matricula un instante, lee la
// estructura y se desmatricula.
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
    // Aulas DISTINTAS que incumplen algo (una que falla en ambas cosas cuenta una vez)
    incumplen: conDatos.filter(r => r.cumple_pesos === false || r.cumple_escala === false).length,
    pesos_mal: conDatos.filter(r => r.cumple_pesos === false).length,
    escala_mal: conDatos.filter(r => r.cumple_escala === false).length,
    sin_evaluaciones: conDatos.filter(r => r.items_evaluacion === 0).length,
    sin_ponderacion: conDatos.filter(r => (r.items_evaluacion ?? 0) > 0 && r.suma_pesos == null).length,
    sin_datos: rows.filter(r => r.error).length,
    vinculadas: rows.filter(r => r.linked_course).length,
    aulas: rows,
  })
}

const AUDITOR_USERNAME = 'erp-auditor'

// Cuenta de servicio para leer la estructura de aulas sin matriculados.
// Se crea una sola vez; no tiene sesión ni recibe correos.
async function ensureAuditorUser(): Promise<number> {
  const found = await moodleCall('core_user_get_users_by_field', { field: 'username', values: [AUDITOR_USERNAME] })
  if (Array.isArray(found) && found.length) return Number(found[0].id)
  const created = await moodleCall('core_user_create_users', {
    users: [{
      username: AUDITOR_USERNAME,
      password: 'Aud!' + randomBytes(18).toString('base64url'),
      firstname: 'Auditor',
      lastname: 'ERP',
      email: 'auditor.erp@blackwell.university',
      idnumber: 'ERP-AUDITOR',
    }],
  })
  return Number(created?.[0]?.id)
}

export async function POST() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })
  const sb = db()

  const courses = await moodleCall('core_course_get_courses', {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aulas = ((Array.isArray(courses) ? courses : []) as any[]).filter(c => c.format !== 'site')

  let auditorId: number | null = null
  try { auditorId = await ensureAuditorUser() } catch { /* sin cuenta de servicio: aulas vacías quedarán sin datos */ }

  // Categorías de Moodle (para agrupar el reporte). Si la función no está
  // habilitada en el servicio, se agrupa como "(sin categoría)".
  const catName = new Map<number, string>()
  try {
    const cats = await moodleCall('core_course_get_categories', {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map<number, any>(((Array.isArray(cats) ? cats : []) as any[]).map(c => [Number(c.id), c]))
    for (const [id, c] of byId) {
      // Ruta legible: "Padre / Hija" (hasta 2 niveles hacia arriba)
      const parent = c.parent ? byId.get(Number(c.parent)) : null
      catName.set(id, parent ? `${parent.name} / ${c.name}` : c.name)
    }
  } catch { /* función no habilitada */ }

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
      categoria: catName.get(Number(c.categoryid)) ?? null,
      audited_at: new Date().toISOString(),
    }
    const vacio = {
      recursos: null, recursos_activos: null, items_evaluacion: null, items_activos: null,
      items_con_peso: null, suma_pesos: null, escala_total: null, cumple_pesos: null, cumple_escala: null,
    }
    try {
      // Contenido del aula: módulos y su visibilidad (activo = visible).
      // Si la función no está habilitada en el servicio, queda null (se
      // muestra "—", nunca un 0/0 engañoso).
      let recursos: number | null = null, recursosActivos: number | null = null
      const visibleByCmid = new Map<number, boolean>()
      try {
        const contents = await moodleCall('core_course_get_contents', { courseid: c.id })
        recursos = 0; recursosActivos = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const sec of (Array.isArray(contents) ? contents : []) as any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const m of (sec.modules ?? []) as any[]) {
            recursos++
            const activo = (m.visible ?? 1) !== 0
            if (activo) recursosActivos++
            visibleByCmid.set(Number(m.id), activo)
          }
        }
      } catch { /* función no habilitada o aula sin contenido expuesto */ }

      // Lector de estructura: primer matriculado, o la cuenta Auditor ERP
      const enrolled = await moodleCall('core_enrol_get_enrolled_users', {
        courseid: c.id, options: [{ name: 'limitnumber', value: 1 }],
      })
      let readerId: number | null = Array.isArray(enrolled) && enrolled.length ? Number(enrolled[0].id) : null
      let metodo = 'alumno'
      let desmatricular = false
      if (!readerId) {
        if (!auditorId) return { ...base, ...vacio, recursos, recursos_activos: recursosActivos, metodo: null, error: 'aula vacía y sin cuenta de servicio' }
        await moodleCall('enrol_manual_enrol_users', { enrolments: [{ roleid: MOODLE_STUDENT_ROLEID, userid: auditorId, courseid: c.id }] })
        readerId = auditorId
        metodo = 'auditor'
        desmatricular = true
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let courseItem: any = null
      try {
        const rep = await moodleCall('gradereport_user_get_grade_items', { courseid: c.id, userid: readerId })
        items = rep?.usergrades?.[0]?.gradeitems ?? []
        courseItem = items.find(i => i.itemtype === 'course') ?? null
      } finally {
        if (desmatricular) {
          try { await moodleCall('enrol_manual_unenrol_users', { enrolments: [{ userid: readerId, courseid: c.id }] }) } catch { /* best effort */ }
        }
      }

      const rootId = courseItem?.iteminstance ?? null
      // Activo = su módulo es visible (los ítems sin cmid — categorías, manuales — se consideran activos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const esActivo = (i: any) => i.cmid == null || (visibleByCmid.get(Number(i.cmid)) ?? true)
      const mods = items.filter(i => i.itemtype === 'mod')
      const modsActivos = mods.filter(esActivo)
      const conPeso = modsActivos.filter(i => (i.weightraw ?? 0) > 0)
      // Política: primer nivel (cuelga directo del curso), solo ACTIVOS
      const topLevel = items.filter(i => i.itemtype !== 'course' && i.categoryid === rootId && esActivo(i))
      // Si NINGÚN ítem reporta ponderación, el aula no usa (o no expone) pesos
      // — p. ej. agregación por media simple. Eso es "sin ponderación
      // reportada", un estado a investigar, NO un incumplimiento al 0%.
      const reportanPeso = topLevel.filter(i => i.weightraw != null)
      const sumaPesos = topLevel.length && reportanPeso.length
        ? Math.round(topLevel.reduce((s, i) => s + (Number(i.weightraw) || 0), 0) * 10000) / 100
        : null
      const escala = courseItem?.grademax != null ? Number(courseItem.grademax) : null
      // Un aula sin evaluaciones (encuestas, informativas) queda fuera de la
      // política: no se le exige ni suma ni escala.
      const sinEvaluaciones = mods.length === 0
      return {
        ...base,
        recursos, recursos_activos: recursosActivos,
        items_evaluacion: mods.length,
        items_activos: modsActivos.length,
        items_con_peso: conPeso.length,
        suma_pesos: sumaPesos,
        escala_total: escala,
        cumple_pesos: sinEvaluaciones ? null : (sumaPesos == null ? null : Math.abs(sumaPesos - 100) <= 0.5),
        cumple_escala: sinEvaluaciones ? null : (escala == null ? null : escala === 100),
        metodo, error: null,
      }
    } catch (e) {
      return { ...base, ...vacio, metodo: null, error: e instanceof Error ? e.message.slice(0, 120) : 'error' }
    }
  }

  // En tandas para no exceder el tiempo
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
