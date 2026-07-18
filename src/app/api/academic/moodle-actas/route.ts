import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured } from '@/lib/moodle'
import { importGrades, type ImportRow } from '@/lib/grades-write'
import { computeGraduates } from '@/lib/graduates'
import { recomputeSituations } from '@/lib/withdrawals'
import { advanceCarousels } from '@/lib/carousel'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// El total del aula: ítem de tipo 'course' que Moodle ya calcula.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function courseTotal(gradeitems: any[]): number | null {
  const item = (gradeitems ?? []).find(i => i.itemtype === 'course')
  if (!item) return null
  let v: number | null = item.graderaw ?? null
  if (v == null && typeof item.gradeformatted === 'string') {
    const n = parseFloat(item.gradeformatted.replace(',', '.'))
    v = isFinite(n) ? n : null
  }
  if (v == null) return null
  // Escalar a 0-100 si el aula usa otro máximo
  const max = Number(item.grademax ?? 100)
  if (isFinite(max) && max > 0 && max !== 100) v = (v / max) * 100
  return Math.round(v * 100) / 100
}

// Alumnos del aula: userid → identidad (el idnumber es nuestro external_id)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrolledMap(courseid: number): Promise<Map<number, { idnumber: string; fullname: string; email: string | null }>> {
  const enrolled = await moodleCall('core_enrol_get_enrolled_users', { courseid })
  const map = new Map<number, { idnumber: string; fullname: string; email: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (Array.isArray(enrolled) ? enrolled : []) as any[]) {
    map.set(Number(u.id), { idnumber: String(u.idnumber ?? '').trim(), fullname: u.fullname ?? '', email: u.email ?? null })
  }
  return map
}

// GET               → inventario de aulas Moodle, con candidato de asignatura por código
// GET ?courseid=N   → vista previa del acta: quién cruza, qué total trae, quién no
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })
  const sb = db()
  const courseidParam = req.nextUrl.searchParams.get('courseid')

  if (!courseidParam) {
    const courses = await moodleCall('core_course_get_courses', {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aulas = ((Array.isArray(courses) ? courses : []) as any[])
      .filter(c => c.format !== 'site')
      .map(c => ({ id: c.id, shortname: c.shortname, fullname: c.fullname, visible: c.visible }))

    // VÍNCULO EXACTO: semester_offerings.moodle_course_id (el ID de aula que se
    // configura en el detalle del grupo). Cuando existe, ESA es la asignatura
    // destino — sin interpretar nombres. El parseo del código del shortname
    // queda solo como sugerencia para aulas aún no vinculadas.
    const { data: linkedOffs } = await sb.from('semester_offerings')
      .select('moodle_course_id, course:academic_courses(id, code, name, academic_programs(name)), grupo:academic_groups(abbreviation, name)')
      .not('moodle_course_id', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedByAula = new Map<number, any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (linkedOffs ?? []) as any[]) {
      const aulaId = Number(o.moodle_course_id)
      if (!isFinite(aulaId) || !o.course) continue
      linkedByAula.set(aulaId, {
        course: { id: o.course.id, code: o.course.code, name: o.course.name, program: o.course.academic_programs?.name ?? '' },
        group: o.grupo ? [o.grupo.abbreviation, o.grupo.name].filter(Boolean).join(' · ') : null,
      })
    }

    // Regla institucional: SOLO se importa por vínculo exacto. Las aulas sin
    // vincular se muestran para que se vea qué falta, pero no son importables.
    // Los programas de campus socio usan otras aulas virtuales: esos van por
    // el importador CSV, no por aquí.
    return NextResponse.json({ aulas: aulas.map(a => ({ ...a, linked: linkedByAula.get(Number(a.id)) ?? null })) })
  }

  // Vista previa de un aula
  const courseid = Number(courseidParam)
  const [users, report] = await Promise.all([
    enrolledMap(courseid),
    moodleCall('gradereport_user_get_grade_items', { courseid }),
  ])

  // Puente idnumber → estudiante
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studs: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students')
      .select('id, external_id, document_number, first_name, last_name, second_last_name, email').range(from, from + 999)
    const rows = data ?? []
    studs.push(...rows)
    if (rows.length < 1000) break
  }
  const byExternal = new Map(studs.filter(s => s.external_id).map(s => [String(s.external_id), s]))

  const matched: { document: string; name: string; total: number | null }[] = []
  const unmatched: { fullname: string; idnumber: string }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    const total = courseTotal(ug.gradeitems)
    if (!stu) { unmatched.push({ fullname: u?.fullname ?? ug.userfullname ?? '?', idnumber: u?.idnumber ?? '' }); continue }
    matched.push({
      document: String(stu.document_number ?? ''),
      name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '),
      total,
    })
  }
  matched.sort((a, b) => a.name.localeCompare(b.name))

  // ¿Cuántas notas de esta aula ya están en el ERP y cuántas cerradas?
  const { data: existentes } = await sb.from('academic_grades')
    .select('external_id, locked_at').like('external_id', `moodle:${courseid}:%`)
  const yaImportadas = (existentes ?? []).length
  const cerradas = ((existentes ?? []) as { locked_at: string | null }[]).filter(g => g.locked_at).length

  return NextResponse.json({
    courseid,
    alumnos_en_reporte: (report?.usergrades ?? []).length,
    matched_total: matched.length,
    con_nota: matched.filter(m => m.total != null).length,
    sin_nota: matched.filter(m => m.total == null).length,
    ya_importadas: yaImportadas,
    cerradas,
    unmatched,
    matched,
  })
}

// PATCH { courseid, action: 'lock' | 'unlock' } → cierra o reabre el acta del
// aula. Cerrada = ninguna importación (Moodle/CSV/sync) puede tocar esas notas;
// protege contra aulas que se limpian para reutilizarlas con otra cohorte.
// El editor manual sigue pudiendo corregir, con auditoría.
export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { courseid?: number; action?: 'lock' | 'unlock' } | null
  if (!b?.courseid || !b?.action || !['lock', 'unlock'].includes(b.action)) {
    return NextResponse.json({ error: 'Falta courseid o action (lock|unlock)' }, { status: 400 })
  }
  const sb = db()
  const patch = b.action === 'lock' ? { locked_at: new Date().toISOString() } : { locked_at: null }
  const { data, error } = await sb.from('academic_grades')
    .update(patch).like('external_id', `moodle:${b.courseid}:%`).select('external_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: b.action, filas: (data ?? []).length })
}

// POST { courseid, term_year, term_block } → importa el acta.
// La asignatura destino NO viene del cliente: la decide el vínculo exacto
// (semester_offerings.moodle_course_id). Un aula sin vincular no se puede
// importar — se vincula en el detalle del grupo. Se importan solo los alumnos
// que cruzan por el puente y traen total; los "en curso" no entran.
// Reimportar es seguro: upsert por external_id moodle:{aula}:{usuario}, y las
// filas corregidas a mano quedan protegidas por el trigger.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const b = await req.json().catch(() => null) as { courseid?: number; term_year?: number; term_block?: string } | null
  if (!b?.courseid || !b?.term_year || !b?.term_block?.trim()) {
    return NextResponse.json({ error: 'Falta courseid, term_year o term_block' }, { status: 400 })
  }

  const sb = db()
  const { data: linkedOffs } = await sb.from('semester_offerings')
    .select('course:academic_courses(id, code, name, credits, program_id, academic_programs(category_id))')
    .eq('moodle_course_id', String(b.courseid))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedCourses = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (linkedOffs ?? []) as any[]) if (o.course) linkedCourses.set(o.course.id, o.course)
  if (linkedCourses.size === 0) {
    return NextResponse.json({ error: 'Esta aula no está vinculada a ninguna asignatura. Vincúlala en el detalle del grupo (ID curso Moodle) antes de importar.' }, { status: 400 })
  }
  if (linkedCourses.size > 1) {
    return NextResponse.json({ error: 'Esta aula está vinculada a más de una asignatura distinta; corrige el vínculo en los grupos antes de importar.' }, { status: 400 })
  }
  const destCourse = [...linkedCourses.values()][0]
  let passing: number | null = null
  if (destCourse.academic_programs?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category')
      .select('passing_score').eq('id', destCourse.academic_programs.category_id).maybeSingle()
    passing = cat?.passing_score ?? null
  }

  const [users, report] = await Promise.all([
    enrolledMap(b.courseid),
    moodleCall('gradereport_user_get_grade_items', { courseid: b.courseid }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studs: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students')
      .select('id, external_id, document_number, first_name, last_name, second_last_name, email').range(from, from + 999)
    const rows = data ?? []
    studs.push(...rows)
    if (rows.length < 1000) break
  }
  const byExternal = new Map(studs.filter(s => s.external_id).map(s => [String(s.external_id), s]))

  const rows: ImportRow[] = []
  let sinPuente = 0, sinTotal = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    if (!stu) { sinPuente++; continue }
    const total = courseTotal(ug.gradeitems)
    if (total == null) { sinTotal++; continue }
    rows.push({
      external_id: `moodle:${b.courseid}:${ug.userid}`,
      document_number: String(stu.document_number ?? ''),
      email: stu.email ?? null,
      student_name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '),
      course_code: destCourse.code,
      course_name: destCourse.name,
      credits: destCourse.credits ?? null,
      term_year: b.term_year,
      term_block: b.term_block.trim(),
      final_grade: total,
      passing_score: passing,
    })
  }

  const result = await importGrades(sb, rows, {
    origin: 'moodle', userId: user.id,
    reason: `Importación de acta Moodle (aula ${b.courseid}) → ${destCourse.code ?? ''} ${destCourse.name ?? ''}`,
  })

  // Efectos globales en una pasada (no por estudiante: serían cientos)
  let recompute: Record<string, unknown> | null = null
  if (result.inserted + result.updated > 0 && !result.errors.length) {
    try {
      const graduates = await computeGraduates(sb)
      const situations = await recomputeSituations(sb)
      const carousels = await advanceCarousels(sb)
      recompute = {
        egresados_detectados: graduates.graduates,
        situaciones_actualizadas: situations.updated,
        avances_de_carrusel: carousels.advanced.length,
      }
    } catch (e) {
      recompute = { error: 'Recalculo pendiente (los crons nocturnos convergen): ' + String(e) }
    }
  }

  return NextResponse.json({ ...result, sin_puente: sinPuente, sin_total: sinTotal, importables: rows.length, recompute })
}
