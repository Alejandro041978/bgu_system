import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured } from '@/lib/moodle'
import { resolveImportTarget, fetchByIn, stableUuid } from '@/lib/grades-write'
import { courseTotal, aulaPolicy, enrolledMap, importAula } from '@/lib/moodle-import'
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
    const all = await fetchByIn(sb, 'academic_grades',
      'external_id, document_number, course_code, course_name, final_grade, retake_grade, source',
      'document_number', docsAula)
    for (const g of all) {
      const k = String(g.document_number)
      if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
      gradesByDoc.get(k)!.push(g)
    }
  }

  const politica = await aulaPolicy(sb, courseid, report)

  const matched: { document: string; name: string; total: number | null; destino: string }[] = []
  const unmatched: { fullname: string; idnumber: string }[] = []
  let yaRegistradas = 0, rellenan = 0, nuevas = 0, actualizan = 0, sinCambio = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    const total = courseTotal(ug.gradeitems)
    if (!stu) { unmatched.push({ fullname: u?.fullname ?? ug.userfullname ?? '?', idnumber: u?.idnumber ?? '' }); continue }
    const doc = String(stu.document_number ?? '')
    let destino = 'en curso'
    if (total != null && linkedCourse) {
      const r = resolveImportTarget(gradesByDoc.get(doc) ?? [], linkedCourse, stableUuid(`moodle:${courseid}:${ug.userid}`))
      if (r.action === 'skip') { destino = 'ya registrada (histórico)'; yaRegistradas++ }
      else if (r.action === 'update') {
        if (r.prev_value != null && Math.abs(Number(r.prev_value) - total) < 0.005) { destino = 'sin cambio'; sinCambio++ }
        else { destino = `actualiza (${r.prev_value ?? '—'} → ${total})`; actualizan++ }
      }
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

  // Notas de esta aula ya en el ERP (marcadas con moodle_course_id al
  // importar); y las de cuentas que YA NO aparecen en el aula (cohortes que
  // rotaron, desmatriculados): se conservan y se reportan.
  const { data: existentes } = await sb.from('academic_grades')
    .select('external_id, locked_at, student_name, document_number, final_grade')
    .eq('moodle_course_id', courseid)
  const yaImportadas = (existentes ?? []).length
  const cerradas = ((existentes ?? []) as { locked_at: string | null }[]).filter(g => g.locked_at).length
  const docsEnAula = new Set(matched.map(m => m.document))
  const desaparecidos = ((existentes ?? []) as { student_name: string | null; document_number: string | null; final_grade: number | null }[])
    .filter(g => !docsEnAula.has(String(g.document_number ?? '')))
    .map(g => ({ name: g.student_name ?? '?', document: g.document_number ?? '', value: g.final_grade }))

  return NextResponse.json({
    courseid,
    politica,
    alumnos_en_reporte: (report?.usergrades ?? []).length,
    matched_total: matched.length,
    con_nota: matched.filter(m => m.total != null).length,
    sin_nota: matched.filter(m => m.total == null).length,
    ya_importadas: yaImportadas,
    cerradas,
    ya_registradas_activa: yaRegistradas,
    rellenan_pendiente: rellenan,
    nuevas,
    actualizan,
    sin_cambio: sinCambio,
    desaparecidos,
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
    .update(patch).eq('moodle_course_id', b.courseid).select('external_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: b.action, filas: (data ?? []).length })
}

// POST { courseid } → importa el acta. Pipeline compartido en lib/moodle-import
// (mismo que usa el cron 4×/día); aquí solo autenticación, llamada y los
// efectos globales inmediatos.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const b = await req.json().catch(() => null) as { courseid?: number } | null
  if (!b?.courseid) {
    return NextResponse.json({ error: 'Falta courseid' }, { status: 400 })
  }

  const sb = db()
  const r = await importAula(sb, b.courseid, user.id)
  if (!r.ok) {
    return NextResponse.json({ error: r.error, politica: r.politica }, { status: r.status ?? 500 })
  }
  const result = r.summary

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

  return NextResponse.json({ ...result, recompute })
}
