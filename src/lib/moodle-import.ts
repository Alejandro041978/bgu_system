import { moodleCall } from './moodle'
import { rendidoPct, estadoAcademico, huboEvaluacionNueva, type ItemProceso } from './grade-status'
import { importGrades, resolveImportTarget, fetchByIn, stableUuid, type ImportRow } from './grades-write'
import { asegurarMatriculas, estadoDeNota, type MatriculaDeNota } from './course-enrollments'

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
  // Tolerancia de centésimas: con agregación Natural el total del curso es la
  // SUMA de los máximos de los ítems, y los pesos convertidos son decimales
  // periódicos (12 × 4.16667 = 50.00004…): un aula perfectamente sana reporta
  // 99.99999. Exigir el 100 exacto rechazaba todo el lote convertido.
  if (escala != null && Math.abs(escala - 100) > 0.02) violations.push(`la escala del total es ${escala}, no 100`)
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
  // El periodo de la nota sale de la OFERTA del aula —semester_offerings dice
  // en qué semestre se dictó— y de ahí a su año académico.
  //
  // Antes era `new Date().getFullYear()`: el año de la corrida del importador.
  // Las 1.703 notas de Moodle decían todas 2026, y 924 de ellas son de cursos
  // dictados en 2023, 2024 o 2025. Peor: cada re-importación las volvía a
  // sellar con el año en curso, así que el dato migraba solo.
  //
  // Si el aula no tiene oferta, se deja en blanco. Un periodo desconocido es
  // un dato que falta; inventarlo lo convierte en un dato falso, que es lo que
  // nadie puede detectar después.
  // Un aula puede tener VARIAS ofertas: se reutiliza entre cohortes, así que la
  // 155 está ofertada en FALL 2024 y en FALL 2025. Antes se tomaba una con
  // limit(1) sin ordenar —es decir, al azar—, y con eso todas las notas del
  // aula se sellaban con el año de la cohorte equivocada. Se toma la MÁS
  // RECIENTE, que es la que se está dictando.
  const { data: ofertas } = await sb.from('semester_offerings')
    .select('semester:academic_semesters(id, name, start_date, year:academic_years(start_date))')
    .eq('moodle_course_id', String(courseid))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sems = ((ofertas ?? []) as any[]).map(o => o.semester).filter(Boolean)
    .sort((a, b) => String(b?.year?.start_date ?? '').localeCompare(String(a?.year?.start_date ?? '')))
  const sem = sems[0] ?? null
  const termYear: number | null = sem?.year?.start_date ? Number(String(sem.year.start_date).slice(0, 4)) : null
  const termBlock: string | null = sem?.name ? String(sem.name).trim().replace(/\s+/g, '_') : null
  // El semestre en sí, que es el orden temporal fiable: año+bloque se
  // contradicen en 6.747 filas del histórico.
  const semesterId: string | null = sem?.id ? String(sem.id) : null
  const semesterStart: string | null = sem?.start_date ? String(sem.start_date) : null
  // Presupuesto para las llamadas pesadas a Moodle (el reporte de un aula de
  // 500+ estudiantes tarda minutos). Sin deadline (importación manual): 240s.
  const heavyTimeout = () => {
    const restante = pre?.deadlineMs ? pre.deadlineMs - Date.now() : 240_000
    if (restante < 20_000) throw new Error('Sin tiempo restante en esta corrida: el aula queda para la siguiente')
    return Math.min(restante, 240_000)
  }

  // ── A qué asignatura del ERP pertenece esta aula ─────────────────────────
  //
  // El vínculo vive en moodle_course_links desde que se movió de la oferta
  // formativa al plan de estudios. Se lee de ahí primero y solo se cae a
  // semester_offerings para las aulas que nunca se migraron: cambiar la fuente
  // sin ese respaldo dejaría de importar aulas que hoy sí funcionan.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedCourses = new Map<string, any>()
  const SEL = 'id, code, name, credits, program_id, academic_programs(category_id)'

  const { data: vinc } = await sb.from('moodle_course_links')
    .select('course_id').eq('aula_id', Number(courseid)).eq('kind', 'asignatura').is('replaced_at', null)
  const cursoIds = [...new Set(((vinc ?? []) as { course_id: string | null }[])
    .map(v => v.course_id).filter(Boolean) as string[])]
  if (cursoIds.length) {
    const { data: cs } = await sb.from('academic_courses').select(SEL).in('id', cursoIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cs ?? []) as any[]) linkedCourses.set(c.id, c)
  }
  if (linkedCourses.size === 0) {
    const { data: linkedOffs } = await sb.from('semester_offerings')
      .select(`course:academic_courses(${SEL})`).eq('moodle_course_id', String(courseid))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (linkedOffs ?? []) as any[]) if (o.course) linkedCourses.set(o.course.id, o.course)
  }

  if (linkedCourses.size === 0) {
    return { ok: false, status: 400, error: 'Esta aula no está vinculada a ninguna asignatura. Vincúlala en Colecciones de aulas antes de importar.' }
  }
  if (linkedCourses.size > 1) {
    return { ok: false, status: 400, error: 'Esta aula está vinculada a más de una asignatura distinta; corrige el vínculo en Colecciones de aulas antes de importar.' }
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

  // Rastro del rechazo. Hasta ahora el aula que no cumplía se devolvía en la
  // respuesta HTTP del cron, que no lee nadie: se detectaba sesenta veces al
  // día y se tiraba. Ahora queda escrito desde cuándo y por qué, y se borra
  // sola en cuanto el aula vuelve a cumplir.
  //
  // Es lo que permite avisar de una transición —"esta aula dejaba de
  // sincronizar hace seis días"— en vez de solo mostrar un estado a quien se
  // acuerde de abrir una pantalla.
  try {
    if (politica.violations.length) {
      const { data: prev } = await sb.from('moodle_aula_audit')
        .select('reject_since').eq('aula_id', courseid).maybeSingle()
      await sb.from('moodle_aula_audit').update({
        reject_since: prev?.reject_since ?? new Date().toISOString(),
        reject_reason: politica.violations.join('; '),
      }).eq('aula_id', courseid)
    } else {
      await sb.from('moodle_aula_audit')
        .update({ reject_since: null, reject_reason: null })
        .eq('aula_id', courseid).not('reject_since', 'is', null)
    }
  } catch { /* el rastro no puede tumbar la importación */ }

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
    // course_id va en el select porque filaDeCurso empareja POR ÉL, y sin él
    // cae al respaldo por nombre. Faltaba: el importador decidía a qué
    // asignatura pertenece cada nota previa comparando textos, que es
    // exactamente lo que dejamos de hacer en todo el ERP — dos asignaturas
    // pueden llamarse igual en programas distintos, y el identificador existe
    // para eso. Una columna que no se pide llega como undefined y el código de
    // abajo no se entera (20/08/2026).
    const all = await fetchByIn(sb, 'academic_grades',
      'external_id, document_number, course_id, course_code, course_name, final_grade, retake_grade, passing_score, source, intento, term_year, semester_id',
      'document_number', docsImport, { orderBy: 'external_id' })
    // Cada nota previa viaja con la FECHA de su semestre: es con lo que se
    // decide si el intento que llega es posterior, y el año suelto no sirve.
    const { data: todosSem } = await sb.from('academic_semesters').select('id, start_date')
    const inicioDe = new Map<string, string>()
    for (const s of (todosSem ?? []) as { id: string; start_date: string | null }[]) {
      if (s.start_date) inicioDe.set(String(s.id), String(s.start_date))
    }
    for (const g of all) {
      const k = String(g.document_number)
      if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
      gradesByDoc.get(k)!.push({
        ...g,
        semester_start: g.semester_id ? (inicioDe.get(String(g.semester_id)) ?? null) : null,
      })
    }
    // Un aula con diez o más alumnos donde NINGUNO tiene una sola nota en todo
    // el ERP no existe: es la lectura del historial que vino vacía. Importar
    // así crea de cero lo que el alumno ya aprobó. Mejor no importar y que la
    // próxima corrida lo intente.
    if (docsImport.length >= 10 && gradesByDoc.size === 0) {
      return {
        ok: false, status: 503,
        error: `No se pudo leer el historial de notas de los ${docsImport.length} alumnos del aula. No se importa nada para no duplicar asignaturas ya aprobadas; se reintentará en la próxima corrida.`,
      }
    }
  }

  const rows: ImportRow[] = []
  // La matrícula por asignatura de cada nota importada. El acta lee de aquí
  // desde el paso 2, así que escribir solo la nota dejaría la asignatura fuera
  // del expediente —y del precio— hasta que el cron nocturno lo reconstruyera.
  const matriculas: MatriculaDeNota[] = []
  // Espejo del detalle: los ítems del aula tal cual (nombre + ponderación +
  // nota), en el formato del Acta Detallada ({n, pct, val, desc}). No hay
  // mapeo contra casillas: el acta es auto-descriptiva y Moodle es la fuente
  // de la estructura de evaluación.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailByExternal = new Map<string, { student_id: string; process: any[]; total: number }>()
  let sinPuente = 0, sinTotal = 0, yaRegistradas = 0, rellenadas = 0, recursados = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ug of ((report?.usergrades ?? []) as any[])) {
    const u = users.get(Number(ug.userid))
    const stu = u?.idnumber ? byExternal.get(u.idnumber) : null
    if (!stu) { sinPuente++; continue }
    const total = courseTotal(ug.gradeitems)
    if (total == null) { sinTotal++; continue }

    // Cuánto ha rendido de verdad en ESTA aula. Se calcula antes de decidir el
    // destino porque un recursado no se abre sin evidencia: las aulas se
    // reutilizan entre cohortes, así que "está matriculado" no significa que
    // esté cursando.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsUsuario = ((ug.gradeitems ?? []) as any[])
      .filter(i => i.itemtype === 'mod' && (i.weightraw ?? 0) > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const process = itemsUsuario.map((i: any, idx: number) => {
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
    const rendido = rendidoPct(process as ItemProceso[])

    // skip = histórico con nota (intocable); update = fila de una importación
    // anterior (las notas cambian en Moodle y se reflejan); fill = "en curso"
    // que se rellena y blinda; retake = recursado; new = fila nueva
    const target = resolveImportTarget(
      gradesByDoc.get(String(stu.document_number ?? '')) ?? [],
      { id: destCourse.id, code: destCourse.code, name: destCourse.name },
      stableUuid(`moodle:${courseid}:${ug.userid}`),
      passing,
      { rendido_pct: rendido, term_year: termYear, semester_start: semesterStart, valor: total },
    )
    if (target.action === 'skip') { yaRegistradas++; continue }
    if (target.action === 'fill') rellenadas++
    // Recursado: el intento anterior quedó desaprobado y éste entra como fila
    // aparte, numerada. No se pisa la nota anterior —desaprobar es un hecho—
    // y el acta se queda con el mejor de los dos.
    if (target.action === 'retake') recursados++
    const externalId = target.external_id
    const fila: ImportRow = {
      external_id: externalId,
      shield: target.shield,
      intento: target.intento ?? 1,
      document_number: String(stu.document_number ?? ''),
      email: stu.email ?? null,
      student_name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '),
      course_code: destCourse.code,
      course_name: destCourse.name,
      // El mismo id con el que se abre la matrícula tres líneas más abajo. Se
      // conocía desde el principio y no se escribía en la nota.
      course_id: destCourse.id,
      credits: destCourse.credits ?? null,
      term_year: termYear,
      term_block: termBlock,
      semester_id: semesterId,
      final_grade: total,
      // El mínimo NO se guarda en la nota: es la regla de la categoría y se
      // resuelve al leer. Guardarlo era lo que devolvía a la base los mínimos
      // que acabábamos de vaciar —1.473 filas reescritas por el cron horario—
      // y lo que dejaba conviviendo dos varas en la misma acta.
      passing_score: null,
    }
    rows.push(fila)

    // SOLO ítems con ponderación. Los ítems sin peso no entran al acta aunque
    // tengan nota: son asistencia a sincrónicas, simulacros, evaluaciones
    // desactivadas de cohortes anteriores o subsanaciones — ninguno afecta el
    // promedio (decisión del usuario, 2026-07-19). Las subsanaciones se
    // registran a mano en retake_grade por el editor.
    // process y rendido ya se calcularon arriba: los necesitaba la decisión
    // del destino, porque un recursado no se abre sin evidencia de actividad.
    //
    // La nota de Moodle es un acumulado sobre el 100% del curso: 3,33 no es
    // "le va mal", es "lleva un quiz de 3,33%". El estado lo decide la
    // aritmética del acumulado, sin umbrales.
    fila.rendido_pct = rendido
    fila.estado_academico = estadoAcademico({
      valor: total, passing_score: passing,
      rendido_pct: fila.rendido_pct, cerrado: false,
    })

    // La matrícula se abre DESPUÉS de calcular estado_academico: estadoDeNota
    // lo necesita para no marcar 'reprobada' a quien va cursando (el acumulado
    // 57,83 de un aula a medias no es un reprobado).
    matriculas.push({
      student_id: stu.id,
      document_number: String(stu.document_number ?? ''),
      course_id: destCourse.id,
      program_id: destCourse.program_id ?? null,
      attempt: target.intento ?? 1,
      semester_id: semesterId,
      term_year: termYear,
      term_block: termBlock,
      status: estadoDeNota({
        ...fila, withdrawn_at: null, synced_at: null,
        course_code: fila.course_code ?? null, course_name: fila.course_name,
        retake_grade: null,
      } as never, passing),
      source: 'moodle',
    })
    detailByExternal.set(externalId, { student_id: stu.id, process, total })
  }

  const result = await importGrades(sb, rows, {
    origin: 'moodle', userId,
    reason: `Importación de acta Moodle (aula ${courseid}) → ${destCourse.code ?? ''} ${destCourse.name ?? ''}`,
  })

  // La matrícula por asignatura, en la misma corrida que la nota.
  //
  // Antes esto lo hacía solo el cron nocturno, y entre la importación y las
  // 4:45 la asignatura no existía en el registro: el acta —que lee de ahí desde
  // el paso 2— la daba por no registrada, y el precio oficial del estudiante no
  // la contaba. Unas horas al día, todos los días, sin ruido.
  let matriculasEscritas = 0
  if (!result.errors.length && matriculas.length) {
    const sids = [...new Set(matriculas.map(m => m.student_id))]
    const enrPrograma = new Map<string, string>()
    if (destCourse.program_id) {
      for (let i = 0; i < sids.length; i += 200) {
        const { data } = await sb.from('academic_student_enrollments')
          .select('id, student_id').eq('program_id', destCourse.program_id).in('student_id', sids.slice(i, i + 200))
        for (const e of (data ?? []) as { id: string; student_id: string }[]) {
          if (!enrPrograma.has(e.student_id)) enrPrograma.set(e.student_id, e.id)
        }
      }
    }
    const r = await asegurarMatriculas(
      sb,
      matriculas.map(m => ({ ...m, program_enrollment_id: enrPrograma.get(m.student_id) ?? null })),
      'importacion-moodle',
    )
    matriculasEscritas = r.escritas
    // Un fallo aquí no invalida la importación —la nota ya está escrita— pero
    // tiene que verse: sin matrícula, esa nota no entra al acta.
    if (r.error) result.errors.push(`Matrículas por asignatura: ${r.error}`)
  }

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
    const detalleAnterior = new Map<string, ItemProceso[] | null>()
    for (let i = 0; i < extIds.length; i += 200) {
      const { data } = await sb.from('academic_grade_details').select('id, external_id, process_grades').in('external_id', extIds.slice(i, i + 200))
      for (const d of (data ?? []) as { id: string; external_id: string; process_grades: ItemProceso[] | null }[]) {
        existingDetail.set(d.external_id, d.id)
        detalleAnterior.set(d.external_id, d.process_grades ?? null)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserts: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: { id: string; patch: any }[] = []
    for (const [externalId, d] of detailByExternal) {
      // El acta cerrada protege la NOTA, no su desglose. Antes se saltaba la
      // fila entera y el detalle viejo sobrevivía para siempre: las 10 actas
      // del aula 566 quedaron con "Evaluación 04 = 100%" cuatro días después
      // de que el aula se normalizara, y ninguna importación posterior podía
      // corregirlas porque su nota ya estaba registrada.
      //
      // El desglose se refresca igual. Lo que no se toca nunca es final_grade:
      // por eso el patch de una fila cerrada va sin él.
      const cerrada = locked.has(externalId)
      const row = {
        external_id: externalId,
        student_id: d.student_id,
        enrollment_id: enrOf.get(d.student_id) ?? null,
        course_code: destCourse.code,
        course_name: destCourse.name,
        term_year: termYear,
        term_block: termBlock,
        final_grade: d.total,
        passing_score: null,   // regla de la categoría, no dato de la nota
        max_score: 100,
        // Sin slot "Total". Era una evaluación inventada al 100% que convivía
        // con las evaluaciones reales —que ya suman 100%— y hacía que el acta
        // detallada mostrara pesos sumando 200%. La nota final vive en su
        // columna y se muestra aparte; no necesita ocupar una fila de la lista.
        grades: [],
        process_grades: d.process,
      }
      const id = existingDetail.get(externalId)
      if (id) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { final_grade, ...sinNota } = row
        updates.push({ id, patch: cerrada ? sinNota : row })
      } else if (!cerrada) {
        inserts.push(row)
      }
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

    // Fecha de la última evaluación REAL. No es synced_at: ese se mueve cada
    // vez que el cron mira el aula. Aquí sólo se marca cuando cambió el valor
    // de algún ítem del detalle — que el profesor renombre una actividad no
    // es una evaluación nueva.
    //
    // Hoy no lo usa nadie. Se captura porque los cierres por inactividad que
    // vienen (aprobados sin 100% a los 30 días, pendientes a los 12 meses)
    // dependen de él, y ese historial no se puede reconstruir después.
    const evaluados = [...detailByExternal.entries()]
      .filter(([ext, d]) => !locked.has(ext) && huboEvaluacionNueva(detalleAnterior.get(ext), d.process as ItemProceso[]))
      .map(([ext]) => ext)
    for (let i = 0; i < evaluados.length; i += 200) {
      await sb.from('academic_grades')
        .update({ last_evaluated_at: new Date().toISOString() })
        .in('external_id', evaluados.slice(i, i + 200))
    }
  }

  return {
    ok: true,
    summary: {
      ...result, sin_puente: sinPuente, sin_total: sinTotal, importables: rows.length,
      ya_registradas_activa: yaRegistradas, rellenadas_pendientes: rellenadas, recursados,
      detalles_escritos: detallesEscritos,
    },
  }
}
