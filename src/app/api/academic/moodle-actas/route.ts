import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured } from '@/lib/moodle'
import { resolveImportTarget, fetchByIn, stableUuid } from '@/lib/grades-write'
import { courseTotal, aulaPolicy, enrolledMap, importAula } from '@/lib/moodle-import'
import { rendidoPct, esItemBono, type ItemProceso } from '@/lib/grade-status'
import { computeGraduates } from '@/lib/graduates'
import { recomputeSituations } from '@/lib/withdrawals'
import { advanceCarousels } from '@/lib/carousel'
import { guardStaff } from '@/lib/api-guard'

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
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

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

    // VÍNCULO EXACTO. La identidad del aula la da la COLECCIÓN
    // (moodle_course_links); la oferta queda como respaldo para las aulas que
    // nunca se migraron. Sin interpretar nombres en ningún caso.
    //
    // Esta lista leía SOLO la oferta, mientras la vista previa ya leía la
    // colección. Resultado: un aula vinculada en su colección y sin oferta
    // —las 711 y 712, por ejemplo— calculaba bien la previa y a la vez decía
    // "esta aula no está vinculada a ninguna asignatura", con el botón de
    // importar bloqueado. Dos lecturas distintas de la misma pregunta en la
    // misma pantalla.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedByAula = new Map<number, any>()

    const { data: linkedOffs } = await sb.from('semester_offerings')
      .select('moodle_course_id, course:academic_courses(id, code, name, academic_programs(name)), grupo:academic_groups(abbreviation, name)')
      .not('moodle_course_id', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grupoDeAula = new Map<number, string | null>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (linkedOffs ?? []) as any[]) {
      const aulaId = Number(o.moodle_course_id)
      if (!isFinite(aulaId)) continue
      const grupo = o.grupo ? [o.grupo.abbreviation, o.grupo.name].filter(Boolean).join(' · ') : null
      if (grupo && !grupoDeAula.has(aulaId)) grupoDeAula.set(aulaId, grupo)
      if (!o.course) continue
      linkedByAula.set(aulaId, {
        course: { id: o.course.id, code: o.course.code, name: o.course.name, program: o.course.academic_programs?.name ?? '' },
        group: grupo,
      })
    }

    // La colección MANDA: pisa lo que dijera la oferta.
    const { data: vincs } = await sb.from('moodle_course_links')
      .select('aula_id, course:academic_courses(id, code, name, academic_programs(name)), coleccion:moodle_collections(name)')
      .eq('kind', 'asignatura').is('replaced_at', null).not('course_id', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of (vincs ?? []) as any[]) {
      const aulaId = Number(v.aula_id)
      if (!isFinite(aulaId) || !v.course) continue
      linkedByAula.set(aulaId, {
        course: { id: v.course.id, code: v.course.code, name: v.course.name, program: v.course.academic_programs?.name ?? '' },
        // Si la colección no trae grupo, se conserva el de la oferta: es el
        // dato que dice a qué carrusel se está dictando.
        group: v.coleccion?.name ?? grupoDeAula.get(aulaId) ?? null,
      })
    }

    // Regla institucional: SOLO se importa por vínculo exacto. Las aulas sin
    // vincular se muestran para que se vea qué falta, pero no son importables.
    // Los programas de campus socio usan otras aulas virtuales: esos van por
    // el importador CSV, no por aquí.
    return NextResponse.json({ aulas: aulas.map(a => ({ ...a, linked: linkedByAula.get(Number(a.id)) ?? null })) })
  }

  // Vista previa de un aula.
  //
  // Las dos llamadas a Moodle van con un tope generoso y, sobre todo, con el
  // fallo explicado: el informe de un aula grande tarda minutos, y cuando el
  // tope se agotaba la excepción subía sin envolver y la pantalla se quedaba
  // girando para siempre sin decir nada.
  const courseid = Number(courseidParam)
  let users, report
  try {
    ;[users, report] = await Promise.all([
      enrolledMap(courseid, 240_000),
      moodleCall('gradereport_user_get_grade_items', { courseid }, { timeoutMs: 240_000 }),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({
      error: /abort|timeout|signal/i.test(msg)
        ? `Moodle no devolvió el acta del aula ${courseid} a tiempo. Suele pasar con aulas de muchos estudiantes: vuelve a intentarlo, y si insiste, impórtala desde el cron nocturno que no tiene este límite.`
        : `Moodle: ${msg}`,
    }, { status: 504 })
  }

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
  // La identidad del aula sale de la COLECCIÓN, igual que en la importación.
  // Leerla de semester_offerings hacía que la vista previa pudiera anticipar
  // una asignatura distinta de la que el importador iba a escribir — y una
  // previsualización que no coincide con lo que va a pasar es peor que ninguna.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let linkedCourse: any = null
  const { data: vinc } = await sb.from('moodle_course_links')
    .select('course_id').eq('aula_id', courseid).eq('kind', 'asignatura').is('replaced_at', null)
  const vincIds = [...new Set(((vinc ?? []) as { course_id: string | null }[]).map(v => v.course_id).filter(Boolean))]
  if (vincIds.length) {
    const { data: cs } = await sb.from('academic_courses')
      .select('id, code, name, program_id, academic_programs(category_id)').in('id', vincIds)
    linkedCourse = cs?.[0] ?? null
  }
  if (!linkedCourse) {
    const { data: prevOffs } = await sb.from('semester_offerings')
      .select('course:academic_courses(id, code, name, program_id, academic_programs(category_id))')
      .eq('moodle_course_id', String(courseid))
    linkedCourse = prevOffs?.[0]?.course ?? null
  }

  // La nota mínima de la CATEGORÍA. Sin ella, resolveImportTarget no puede
  // distinguir una nota aprobada de una desaprobada y lo manda todo al mismo
  // cajón: "ya registrada". Por eso esta pantalla anunciaba 0 importaciones en
  // un aula con recursados pendientes de escribir.
  let passing: number | null = null
  if (linkedCourse?.academic_programs?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category')
      .select('passing_score').eq('id', linkedCourse.academic_programs.category_id).maybeSingle()
    passing = cat?.passing_score != null ? Number(cat.passing_score) : null
  }
  const docsAula = [...new Set([...users.values()].map(u => byExternal.get(u.idnumber))
    .filter(Boolean).map(s => String(s.document_number ?? '')).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradesByDoc = new Map<string, any[]>()
  if (linkedCourse) {
    // Le faltaban DOS columnas y cada una rompía algo distinto:
    //
    //  · course_id — filaDeCurso empareja por él; sin él caía al respaldo por
    //    nombre, que es justo lo que dejamos de usar en el resto del ERP.
    //  · semester_id — de él sale el "semester_start" con el que se decide si
    //    un intento es POSTERIOR al anterior. Sin él, la previa comparaba por
    //    term_year y la importación por semestre: dos respuestas distintas a
    //    la misma pregunta, y por eso la previa anunciaba una cosa y el commit
    //    hacía otra (20/08/2026).
    //
    // Una columna que no se pide llega como undefined y nadie se queja.
    const all = await fetchByIn(sb, 'academic_grades',
      'external_id, document_number, course_id, course_code, course_name, final_grade, retake_grade, passing_score, source, intento, term_year, semester_id',
      'document_number', docsAula)
    const { data: semAll } = await sb.from('academic_semesters').select('id, start_date')
    const inicioSem = new Map<string, string>()
    for (const s of (semAll ?? []) as { id: string; start_date: string | null }[]) {
      if (s.start_date) inicioSem.set(String(s.id), String(s.start_date))
    }
    for (const g of all) {
      const k = String(g.document_number)
      if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
      gradesByDoc.get(k)!.push({
        ...g,
        semester_start: g.semester_id ? (inicioSem.get(String(g.semester_id)) ?? null) : null,
      })
    }
  }

  // El año del aula sale de su oferta MÁS RECIENTE, igual que en el importador:
  // un aula reutilizada entre cohortes tiene varias, y elegir una al azar
  // fechaba las notas con la cohorte equivocada.
  const { data: ofertasAula } = await sb.from('semester_offerings')
    .select('semester:academic_semesters(start_date, year:academic_years(start_date))')
    .eq('moodle_course_id', String(courseid))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inicios = ((ofertasAula ?? []) as any[])
    .map(o => o.semester?.year?.start_date).filter(Boolean).sort().reverse()
  // El semestre del aula, que es con lo que el importador decide si un intento
  // es posterior al anterior. La previa no lo pedía y comparaba por año, así
  // que anunciaba un recursado donde el commit no lo abría (o al revés).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semsAula = ((ofertasAula ?? []) as any[]).map(o => o.semester).filter(Boolean)
    .sort((a, b) => String(b?.year?.start_date ?? '').localeCompare(String(a?.year?.start_date ?? '')))
  const semesterStartAula: string | null = semsAula[0]?.start_date ? String(semsAula[0].start_date) : null
  const termYearAula: number | null = inicios.length ? Number(String(inicios[0]).slice(0, 4)) : null

  const politica = await aulaPolicy(sb, courseid, report)

  const matched: { document: string; name: string; total: number | null; destino: string }[] = []
  const unmatched: { fullname: string; idnumber: string }[] = []
  let yaRegistradas = 0, rellenan = 0, nuevas = 0, actualizan = 0, sinCambio = 0, recursados = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    const total = courseTotal(ug.gradeitems)
    if (!stu) { unmatched.push({ fullname: u?.fullname ?? ug.userfullname ?? '?', idnumber: u?.idnumber ?? '' }); continue }
    const doc = String(stu.document_number ?? '')
    let destino = 'en curso'
    if (total != null && linkedCourse) {
      // La misma evidencia que exige el importador para abrir un recursado:
      // cuánto rindió en ESTA aula y de qué periodo es. Si la previa no la
      // pasara, volvería a anunciar algo distinto de lo que va a ocurrir.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc = ((ug.gradeitems ?? []) as any[])
        // Los bonos (Live Class Quiz, extra credit) no pesan en el 100%: fuera
        // del rendido, igual que en el importador automático.
        .filter(i => i.itemtype === 'mod' && (i.weightraw ?? 0) > 0 && !esItemBono(i.itemname))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((i: any) => ({
          pct: i.weightraw != null ? Math.round(Number(i.weightraw) * 10000) / 100 : null,
          val: i.graderaw ?? null,
        }))
      const r = resolveImportTarget(
        gradesByDoc.get(doc) ?? [], linkedCourse, stableUuid(`moodle:${courseid}:${ug.userid}`), passing,
        { rendido_pct: rendidoPct(proc as ItemProceso[]), term_year: termYearAula, semester_start: semesterStartAula, semester_id: semsAula[0]?.id ? String(semsAula[0].id) : null, valor: total },
      )
      if (r.action === 'skip') { destino = 'ya registrada (histórico)'; yaRegistradas++ }
      else if (r.action === 'retake') {
        destino = `recursado ${(r.intento ?? 2) - 1} (anterior: ${r.prev_value ?? '—'})`
        recursados++
      }
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

  // Diagnóstico del "Total del curso", solo cuando NADIE tiene nota.
  //
  // Un aula puede tener el libro lleno de calificaciones y devolver cero notas
  // importables, y hasta ahora la pantalla solo sabía decir "0 con nota final".
  // Eso obliga a adivinar: ¿no hay notas, están ocultas, el total no calcula?
  // Con el aula 340 se probaron tres hipótesis a ciegas antes de mirar el dato
  // (19/08/2026).
  //
  // Se muestra tal cual llega el ítem 'course' del webservice para los primeros
  // alumnos. Si el informe del profesor enseña un total y aquí viene vacío, la
  // diferencia está en lo que Moodle expone, no en cómo lo lee el ERP — y eso
  // se ve de un vistazo en vez de deducirse.
  // Se eligen alumnos que TENGAN alguna actividad calificada. Los primeros del
  // informe suelen ser cuentas sin actividad —profesores, gestores— y enseñar
  // cuatro filas vacías no distingue "no hay notas" de "no llegan": justo lo
  // que este bloque existe para separar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conActividad = ((report?.usergrades ?? []) as any[]).filter(ug =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((ug.gradeitems ?? []) as any[]).some(i => i.itemtype === 'mod' && i.graderaw != null))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const muestra: any[] = conActividad.length
    ? conActividad.slice(0, 4)
    : ((report?.usergrades ?? []) as any[]).slice(0, 4)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagnostico = matched.every(m => m.total == null)
    ? muestra.map(ug => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const it = ((ug.gradeitems ?? []) as any[]).find(i => i.itemtype === 'course')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conNota = ((ug.gradeitems ?? []) as any[]).filter(i => i.itemtype === 'mod' && i.graderaw != null)
      return {
        alumno: ug.userfullname ?? String(ug.userid),
        hay_item_total: !!it,
        graderaw: it?.graderaw ?? null,
        gradeformatted: it?.gradeformatted ?? null,
        grademax: it?.grademax ?? null,
        // Moodle no expone un flag "hidden" en este informe: si el ítem está
        // oculto para quien lee, sencillamente llega sin valor. Contar cuántas
        // actividades SÍ traen nota separa "no hay notas" de "hay notas y el
        // total no llega".
        actividades_con_nota: conNota.length,
        ejemplo: conNota.slice(0, 3).map(i => `${i.itemname ?? '?'}=${i.graderaw}`),
      }
    })
    : null

  return NextResponse.json({
    courseid,
    politica,
    diagnostico,
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
    recursados,
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
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

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
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

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
