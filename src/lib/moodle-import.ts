import { moodleCall } from './moodle'
import { importGrades, resolveImportTarget, fetchByIn, stableUuid, type ImportRow } from './grades-write'

// ---------------------------------------------------------------------------
// Importación de un acta de Moodle al expediente. Pipeline compartido entre
// la página Actas de Moodle (importación manual puntual) y el cron que corre
// 4 veces al día sobre todas las aulas vinculadas que cumplen la política.
// Las reglas no cambian según quién llame: vínculo exacto, compuerta de
// política, propiedad de la fila (resolveImportTarget), auditoría, blindajes
// y actas cerradas intactas.
// ---------------------------------------------------------------------------

// Actor sintético del cron en grade_audit (changed_by es uuid).
export const CRON_ACTOR_UUID = stableUuid('cron:moodle-import')

// El total del aula: ítem de tipo 'course' que Moodle ya calcula.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function courseTotal(gradeitems: any[]): number | null {
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

// Política del aula (mismos criterios y misma FUENTE que el Auditor):
//  - Pesos: suma aritmética de coeficientes de la CONFIGURACIÓN del aula
//    (moodle_aula_audit.suma_coeficientes, sincronizada desde la BD de
//    Moodle). El peso por estudiante del web service NO sirve de criterio:
//    Moodle lo normaliza sobre lo rendido (siempre ~100) y no reporta nada
//    si nadie rindió. Un aula sin auditoría de pesos no se puede importar.
//  - Escala del total y visibilidad: en vivo por web service (confiables).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aulaPolicy(sb: any, courseid: number, report: any): Promise<{ suma_pesos: number | null; escala: number | null; visible: boolean | null; audited_at: string | null; violations: string[] }> {
  let visible: boolean | null = null
  try {
    const cf = await moodleCall('core_course_get_courses_by_field', { field: 'id', value: String(courseid) })
    const c0 = cf?.courses?.[0]
    if (c0) visible = c0.visible !== 0
  } catch { /* sin permiso para ver el curso */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (report?.usergrades?.[0]?.gradeitems ?? []) as any[]
  const courseItem = items.find(i => i.itemtype === 'course')
  const escala = courseItem?.grademax != null ? Number(courseItem.grademax) : null

  const { data: audit } = await sb.from('moodle_aula_audit')
    .select('suma_coeficientes, audited_at').eq('aula_id', courseid).maybeSingle()
  const sumaPesos = audit?.suma_coeficientes != null ? Number(audit.suma_coeficientes) : null
  const auditedAt = audit?.audited_at ? String(audit.audited_at).slice(0, 10) : null

  const violations: string[] = []
  if (visible === false) violations.push('el aula está oculta (no activa)')
  if (escala != null && escala !== 100) violations.push(`la escala del total es ${escala}, no 100`)
  if (sumaPesos == null) violations.push('el aula no tiene auditoría de ponderaciones — corre el Auditor (sincronización de coeficientes) antes de importar')
  else if (Math.abs(sumaPesos - 100) > 0.5) violations.push(`las ponderaciones configuradas suman ${sumaPesos}%, no 100% (auditoría del ${auditedAt ?? 'sin fecha'})`)
  return { suma_pesos: sumaPesos, escala, visible, audited_at: auditedAt, violations }
}

// Alumnos del aula: userid → identidad (el idnumber es nuestro external_id)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrolledMap(courseid: number, timeoutMs?: number): Promise<Map<number, { idnumber: string; fullname: string; email: string | null }>> {
  const enrolled = await moodleCall('core_enrol_get_enrolled_users', { courseid }, { timeoutMs })
  const map = new Map<number, { idnumber: string; fullname: string; email: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (Array.isArray(enrolled) ? enrolled : []) as any[]) {
    map.set(Number(u.id), { idnumber: String(u.idnumber ?? '').trim(), fullname: u.fullname ?? '', email: u.email ?? null })
  }
  return map
}

export interface ImportAulaResult {
  ok: boolean
  status?: number
  error?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  politica?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary?: any
}

// Puente idnumber → estudiante, cargado una vez y reutilizable entre aulas
// (el cron procesa decenas: cargarlo por aula era el sobrecosto evitable).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadStudentsByExternal(sb: any): Promise<Map<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studs: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students')
      .select('id, external_id, document_number, first_name, last_name, second_last_name, email').range(from, from + 999)
    const page = data ?? []
    studs.push(...page)
    if (page.length < 1000) break
  }
  return new Map(studs.filter(s => s.external_id).map(s => [String(s.external_id), s]))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importAula(sb: any, courseid: number, userId: string, pre?: { byExternal?: Map<string, any>; deadlineMs?: number }): Promise<ImportAulaResult> {
  const termYear = new Date().getFullYear()
  // Presupuesto para las llamadas pesadas a Moodle (el reporte de un aula de
  // 500+ estudiantes tarda minutos). Sin deadline (importación manual): 240s.
  const heavyTimeout = () => {
    const restante = pre?.deadlineMs ? pre.deadlineMs - Date.now() : 240_000
    if (restante < 20_000) throw new Error('Sin tiempo restante en esta corrida: el aula queda para la siguiente')
    return Math.min(restante, 240_000)
  }

  const { data: linkedOffs } = await sb.from('semester_offerings')
    .select('course:academic_courses(id, code, name, credits, program_id, academic_programs(category_id))')
    .eq('moodle_course_id', String(courseid))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedCourses = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (linkedOffs ?? []) as any[]) if (o.course) linkedCourses.set(o.course.id, o.course)
  if (linkedCourses.size === 0) {
    return { ok: false, status: 400, error: 'Esta aula no está vinculada a ninguna asignatura. Vincúlala en el detalle del grupo (ID curso Moodle) antes de importar.' }
  }
  if (linkedCourses.size > 1) {
    return { ok: false, status: 400, error: 'Esta aula está vinculada a más de una asignatura distinta; corrige el vínculo en los grupos antes de importar.' }
  }
  const destCourse = [...linkedCourses.values()][0]
  let passing: number | null = null
  if (destCourse.academic_programs?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category')
      .select('passing_score').eq('id', destCourse.academic_programs.category_id).maybeSingle()
    passing = cat?.passing_score ?? null
  }

  const users = await enrolledMap(courseid, heavyTimeout())
  const byExternal = pre?.byExternal ?? await loadStudentsByExternal(sb)

  // El reporte completo de un aula GRANDE (500+ matriculados) tarda minutos y
  // revienta cualquier timeout. Para esas, se pide estudiante por estudiante
  // en paralelo (solo los que cruzan el puente idnumber→estudiante: los demás
  // terminarían en sin_puente igual) — llamadas chicas que escalan.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let report: any
  if (users.size > 150) {
    const targets = [...users.entries()]
      .filter(([, u]) => u.idnumber && byExternal.has(u.idnumber))
      .map(([uid]) => uid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usergrades: any[] = []
    let idx = 0
    const worker = async () => {
      while (idx < targets.length) {
        heavyTimeout() // corta limpio si la corrida ya no tiene tiempo
        const uid = targets[idx++]
        try {
          const r = await moodleCall('gradereport_user_get_grade_items', { courseid, userid: uid }, { timeoutMs: 30_000 })
          if (r?.usergrades?.length) usergrades.push(...r.usergrades)
        } catch { /* un usuario fallido no tumba el aula */ }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
    report = { usergrades }
  } else {
    report = await moodleCall('gradereport_user_get_grade_items', { courseid }, { timeoutMs: heavyTimeout() })
  }

  // Compuerta de política: un aula que no cumple NO se importa.
  const politica = await aulaPolicy(sb, courseid, report)
  if (politica.violations.length) {
    return {
      ok: false, status: 400, politica,
      error: 'El aula no cumple la política del campus y no se puede importar: ' + politica.violations.join('; ') + '. Corrígela en Moodle y vuelve a intentar.',
    }
  }

  // Notas existentes de los alumnos del aula, para resolver el destino de
  // cada una sin duplicar lo que ya vino de SystemActiva.
  const docsImport = [...new Set([...users.values()].map(u => byExternal.get(u.idnumber))
    .filter(Boolean).map(s => String(s.document_number ?? '')).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradesByDoc = new Map<string, any[]>()
  {
    const all = await fetchByIn(sb, 'academic_grades',
      'external_id, document_number, course_code, course_name, final_grade, retake_grade, source',
      'document_number', docsImport)
    for (const g of all) {
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

    // skip = histórico con nota (intocable); update = fila de una importación
    // anterior (las notas cambian en Moodle y se reflejan); fill = "en curso"
    // que se rellena y blinda; new = fila nueva
    const target = resolveImportTarget(
      gradesByDoc.get(String(stu.document_number ?? '')) ?? [],
      { code: destCourse.code, name: destCourse.name },
      stableUuid(`moodle:${courseid}:${ug.userid}`),
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
      term_year: termYear,
      term_block: null,
      final_grade: total,
      passing_score: passing,
    })

    // SOLO ítems con ponderación. Los ítems sin peso no entran al acta aunque
    // tengan nota: son asistencia a sincrónicas, simulacros, evaluaciones
    // desactivadas de cohortes anteriores o subsanaciones — ninguno afecta el
    // promedio (decisión del usuario, 2026-07-19). Las subsanaciones se
    // registran a mano en retake_grade por el editor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((ug.gradeitems ?? []) as any[])
      .filter(i => i.itemtype === 'mod' && (i.weightraw ?? 0) > 0)
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
    origin: 'moodle', userId,
    reason: `Importación de acta Moodle (aula ${courseid}) → ${destCourse.code ?? ''} ${destCourse.name ?? ''}`,
  })

  // Marca de origen: toda fila del aula (rellenada, actualizada o nueva) queda
  // con su moodle_course_id — de esto dependen el candado de acta y la
  // detección de desaparecidos. También backfillea importaciones previas.
  // Dos pasadas por el trigger protect_edited_grades: descarta updates a filas
  // blindadas (edited_at) que no muevan edited_at, así que a esas se les
  // refresca el blindaje en el mismo update. Las selladas no se tocan.
  const idsAula = rows.map(r => r.external_id)
  for (let i = 0; i < idsAula.length; i += 200) {
    const chunk = idsAula.slice(i, i + 200)
    await sb.from('academic_grades')
      .update({ moodle_course_id: courseid })
      .in('external_id', chunk).is('edited_at', null).is('locked_at', null)
    await sb.from('academic_grades')
      .update({ moodle_course_id: courseid, edited_at: new Date().toISOString() })
      .in('external_id', chunk).not('edited_at', 'is', null).is('locked_at', null)
  }

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
        term_year: termYear,
        term_block: null,
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

  return {
    ok: true,
    summary: {
      ...result, sin_puente: sinPuente, sin_total: sinTotal, importables: rows.length,
      ya_registradas_activa: yaRegistradas, rellenadas_pendientes: rellenadas,
      detalles_escritos: detallesEscritos,
    },
  }
}
