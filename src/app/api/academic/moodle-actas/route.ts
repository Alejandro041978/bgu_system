import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured } from '@/lib/moodle'
import { importGrades, resolveImportTarget, type ImportRow } from '@/lib/grades-write'
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

  // Asignatura vinculada (para anticipar el destino de cada nota) y notas
  // existentes de los alumnos del aula
  const { data: prevOffs } = await sb.from('semester_offerings')
    .select('course:academic_courses(code, name)').eq('moodle_course_id', String(courseid))
  const linkedCourse = prevOffs?.[0]?.course ?? null
  const docsAula = [...new Set([...users.values()].map(u => byExternal.get(u.idnumber))
    .filter(Boolean).map(s => String(s.document_number ?? '')).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradesByDoc = new Map<string, any[]>()
  if (linkedCourse) {
    for (let i = 0; i < docsAula.length; i += 200) {
      const { data } = await sb.from('academic_grades')
        .select('external_id, document_number, course_code, course_name, final_grade, retake_grade, source')
        .in('document_number', docsAula.slice(i, i + 200))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const g of (data ?? []) as any[]) {
        const k = String(g.document_number)
        if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
        gradesByDoc.get(k)!.push(g)
      }
    }
  }

  const matched: { document: string; name: string; total: number | null; destino: string }[] = []
  const unmatched: { fullname: string; idnumber: string }[] = []
  let yaRegistradas = 0, rellenan = 0, nuevas = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    const total = courseTotal(ug.gradeitems)
    if (!stu) { unmatched.push({ fullname: u?.fullname ?? ug.userfullname ?? '?', idnumber: u?.idnumber ?? '' }); continue }
    const doc = String(stu.document_number ?? '')
    let destino = 'en curso'
    if (total != null && linkedCourse) {
      const r = resolveImportTarget(gradesByDoc.get(doc) ?? [], linkedCourse, `moodle:${courseid}:${ug.userid}`)
      if (r.action === 'skip') { destino = 'ya registrada (Activa)'; yaRegistradas++ }
      else if (r.action === 'fill') { destino = 'rellena pendiente'; rellenan++ }
      else { destino = 'nueva'; nuevas++ }
    } else if (total != null) destino = 'nueva'
    matched.push({
      document: doc,
      name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '),
      total, destino,
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
    ya_registradas_activa: yaRegistradas,
    rellenan_pendiente: rellenan,
    nuevas,
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

  // Notas existentes de los alumnos del aula, para resolver el destino de
  // cada una sin duplicar lo que ya vino de SystemActiva.
  const docsImport = [...new Set([...users.values()].map(u => byExternal.get(u.idnumber))
    .filter(Boolean).map(s => String(s.document_number ?? '')).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradesByDoc = new Map<string, any[]>()
  for (let i = 0; i < docsImport.length; i += 200) {
    const { data } = await sb.from('academic_grades')
      .select('external_id, document_number, course_code, course_name, final_grade, retake_grade, source')
      .in('document_number', docsImport.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (data ?? []) as any[]) {
      const k = String(g.document_number)
      if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
      gradesByDoc.get(k)!.push(g)
    }
  }

  const rows: ImportRow[] = []
  // Espejo del detalle: los ítems del aula tal cual (nombre + ponderación +
  // nota), en el formato del Acta Detallada ({n, pct, val, desc}). No hay
  // mapeo contra casillas: el acta es auto-descriptiva y Moodle es la fuente
  // de la estructura de evaluación.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailByExternal = new Map<string, { student_id: string; process: any[]; total: number }>()
  let sinPuente = 0, sinTotal = 0, yaRegistradas = 0, rellenadas = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    if (!stu) { sinPuente++; continue }
    const total = courseTotal(ug.gradeitems)
    if (total == null) { sinTotal++; continue }

    // ¿Ya existe esta asignatura para el alumno? (skip = de Activa con nota;
    // fill = fila "en curso" que se rellena y blinda; new = fila nueva)
    const target = resolveImportTarget(
      gradesByDoc.get(String(stu.document_number ?? '')) ?? [],
      { code: destCourse.code, name: destCourse.name },
      `moodle:${b.courseid}:${ug.userid}`,
    )
    if (target.action === 'skip') { yaRegistradas++; continue }
    if (target.action === 'fill') rellenadas++
    const externalId = target.external_id
    rows.push({
      external_id: externalId,
      shield: target.shield,
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

    // Ítems con ponderación o con nota (excluye videos/podcasts sin peso ni nota)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((ug.gradeitems ?? []) as any[])
      .filter(i => i.itemtype === 'mod' && ((i.weightraw ?? 0) > 0 || i.graderaw != null))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const process = items.map((i: any, idx: number) => {
      let val: number | null = i.graderaw ?? null
      const max = Number(i.grademax ?? 100)
      if (val != null && isFinite(max) && max > 0 && max !== 100) val = (val / max) * 100
      return {
        n: idx + 1,
        pct: i.weightraw != null ? Math.round(Number(i.weightraw) * 10000) / 100 : null,
        val: val == null ? null : Math.round(val * 100) / 100,
        desc: i.itemname ?? '',
      }
    })
    detailByExternal.set(externalId, { student_id: stu.id, process, total })
  }

  const result = await importGrades(sb, rows, {
    origin: 'moodle', userId: user.id,
    reason: `Importación de acta Moodle (aula ${b.courseid}) → ${destCourse.code ?? ''} ${destCourse.name ?? ''}`,
  })

  // Espejo del detalle hacia el Acta Detallada. Respeta el cierre de acta:
  // las filas selladas no se tocan.
  let detallesEscritos = 0
  if (!result.errors.length && detailByExternal.size) {
    const extIds = [...detailByExternal.keys()]
    const locked = new Set<string>()
    for (let i = 0; i < extIds.length; i += 200) {
      const { data } = await sb.from('academic_grades').select('external_id, locked_at').in('external_id', extIds.slice(i, i + 200))
      for (const g of (data ?? []) as { external_id: string; locked_at: string | null }[]) if (g.locked_at) locked.add(g.external_id)
    }
    const sids = [...new Set([...detailByExternal.values()].map(d => d.student_id))]
    const enrOf = new Map<string, string>()
    for (let i = 0; i < sids.length; i += 200) {
      const { data } = await sb.from('academic_student_enrollments')
        .select('id, student_id').eq('program_id', destCourse.program_id).in('student_id', sids.slice(i, i + 200))
      for (const e of (data ?? []) as { id: string; student_id: string }[]) if (!enrOf.has(e.student_id)) enrOf.set(e.student_id, e.id)
    }
    const existingDetail = new Map<string, string>()
    for (let i = 0; i < extIds.length; i += 200) {
      const { data } = await sb.from('academic_grade_details').select('id, external_id').in('external_id', extIds.slice(i, i + 200))
      for (const d of (data ?? []) as { id: string; external_id: string }[]) existingDetail.set(d.external_id, d.id)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserts: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: { id: string; patch: any }[] = []
    for (const [externalId, d] of detailByExternal) {
      if (locked.has(externalId)) continue
      const row = {
        external_id: externalId,
        student_id: d.student_id,
        enrollment_id: enrOf.get(d.student_id) ?? null,
        course_code: destCourse.code,
        course_name: destCourse.name,
        term_year: b.term_year,
        term_block: b.term_block.trim(),
        final_grade: d.total,
        passing_score: passing,
        max_score: 100,
        grades: [{ n: 1, pct: 100, val: null, desc: 'Total' }],
        process_grades: d.process,
      }
      const id = existingDetail.get(externalId)
      if (id) updates.push({ id, patch: row })
      else inserts.push(row)
    }
    for (let i = 0; i < inserts.length; i += 200) {
      const { error } = await sb.from('academic_grade_details').insert(inserts.slice(i, i + 200))
      if (error) { result.errors.push('detalle: ' + error.message); break }
      detallesEscritos += Math.min(200, inserts.length - i)
    }
    for (let i = 0; i < updates.length; i += 20) {
      const chunk = updates.slice(i, i + 20)
      await Promise.all(chunk.map(u => sb.from('academic_grade_details').update(u.patch).eq('id', u.id)))
      detallesEscritos += chunk.length
    }
  }

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

  return NextResponse.json({
    ...result, sin_puente: sinPuente, sin_total: sinTotal, importables: rows.length,
    ya_registradas_activa: yaRegistradas, rellenadas_pendientes: rellenadas,
    detalles_escritos: detallesEscritos, recompute,
  })
}
