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
  const courseSearch = req.nextUrl.searchParams.get('course_search')?.trim()

  // Búsqueda manual de asignatura destino (cuando el candidato automático no aplica)
  if (courseSearch && courseSearch.length >= 2) {
    const { data } = await sb.from('academic_courses')
      .select('id, code, name, academic_programs(name)')
      .or(`code.ilike.%${courseSearch}%,name.ilike.%${courseSearch}%`)
      .limit(20)
    return NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      courses: ((data ?? []) as any[]).map(c => ({ id: c.id, code: c.code, name: c.name, program: c.academic_programs?.name ?? '' })),
    })
  }

  if (!courseidParam) {
    const courses = await moodleCall('core_course_get_courses', {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aulas = ((Array.isArray(courses) ? courses : []) as any[])
      .filter(c => c.format !== 'site')
      .map(c => ({ id: c.id, shortname: c.shortname, fullname: c.fullname, visible: c.visible }))

    // Candidatos de asignatura: el shortname empieza con el código ("PMB 270 - …")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCourses: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('academic_courses')
        .select('id, code, name, credits, program_id, academic_programs(name)').range(from, from + 999)
      const rows = data ?? []
      allCourses.push(...rows)
      if (rows.length < 1000) break
    }
    const byCode = new Map<string, typeof allCourses>()
    for (const c of allCourses) {
      const k = String(c.code ?? '').trim().toUpperCase()
      if (!k) continue
      if (!byCode.has(k)) byCode.set(k, [])
      byCode.get(k)!.push(c)
    }
    const withCandidates = aulas.map(a => {
      const m = String(a.shortname ?? '').toUpperCase().match(/^([A-Z]{2,4}\s?\d{3})/)
      const cands = m ? (byCode.get(m[1].replace(/(\S)(\d)/, '$1 $2')) ?? byCode.get(m[1]) ?? []) : []
      return {
        ...a,
        candidates: cands.map(c => ({ id: c.id, code: c.code, name: c.name, program: c.academic_programs?.name ?? '' })),
      }
    })
    return NextResponse.json({ aulas: withCandidates })
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

  return NextResponse.json({
    courseid,
    alumnos_en_reporte: (report?.usergrades ?? []).length,
    matched_total: matched.length,
    con_nota: matched.filter(m => m.total != null).length,
    sin_nota: matched.filter(m => m.total == null).length,
    unmatched,
    matched,
  })
}

// POST { courseid, dest_course_id, term_year, term_block } → importa el acta.
// Se importan solo los alumnos que cruzan por el puente y traen total; los
// "en curso" (sin total) no entran. Reimportar es seguro: upsert por
// external_id moodle:{aula}:{usuario}, y las filas corregidas a mano quedan
// protegidas por el trigger.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const b = await req.json().catch(() => null) as { courseid?: number; dest_course_id?: string; term_year?: number; term_block?: string } | null
  if (!b?.courseid || !b?.dest_course_id || !b?.term_year || !b?.term_block?.trim()) {
    return NextResponse.json({ error: 'Falta courseid, dest_course_id, term_year o term_block' }, { status: 400 })
  }

  const sb = db()
  const { data: destCourse } = await sb.from('academic_courses')
    .select('id, code, name, credits, program_id, academic_programs(category_id)').eq('id', b.dest_course_id).maybeSingle()
  if (!destCourse) return NextResponse.json({ error: 'Asignatura destino no encontrada' }, { status: 404 })
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
