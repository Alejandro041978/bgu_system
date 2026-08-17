import { createHash } from 'crypto'
import { recomputeStudentByDocument } from './graduates'
import { advanceCarousels } from './carousel'
import { filaDeCurso } from './course-match'
import { sincronizarEstadoDeMatricula } from './course-enrollments'

// academic_grades.external_id es uuid: los ids legibles ("moodle:...",
// "csv:...", "reg-...") NO caben en la columna. Toda importación deriva su
// identidad con este hash estable: misma semilla → mismo uuid → upsert
// idempotente.
export function stableUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// ---------------------------------------------------------------------------
// Camino ÚNICO de escritura de notas. Toda modificación — editor manual, carga
// CSV, importación de Moodle — pasa por aquí y hace siempre lo mismo:
//   1. deja rastro en grade_audit (campo, valor anterior/nuevo, quién, por qué)
//   2. marca la fila con edited_at/edited_by, lo que la protege del sync de
//      SystemActiva (que salta filas editadas para no pisar correcciones)
//   3. recalcula al estudiante afectado al instante (egreso y situación),
//      sin esperar al cron nocturno
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// .in() + paginación: PostgREST corta en 1000 filas por consulta SIN avisar y
// sin orden garantizado. Un lote de 200 documentos puede tener miles de notas:
// hay que paginar DENTRO de cada lote o se pierden filas al azar (nos pasó:
// actas de asignatura vacías y resoluciones de importación a ciegas).
// ---------------------------------------------------------------------------
export async function fetchByIn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, table: string, select: string, column: string, values: string[],
  // orderBy: columna ÚNICA con la que paginar. Sin ORDER BY, Postgres no
  // garantiza el mismo orden entre una página y la siguiente, y el .range()
  // puede saltarse filas. Por omisión ordena por la columna del filtro, que no
  // desempata: quien pagine datos críticos debe pasar su clave primaria.
  opts?: { orderBy?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  const orderBy = opts?.orderBy ?? column
  for (let i = 0; i < values.length; i += 150) {
    const part = values.slice(i, i + 150)
    for (let from = 0; ; from += 1000) {
      // Un fallo aquí NO puede devolver una lista vacía: quien nos llama la
      // interpretaría como "este dato no existe" y obraría en consecuencia.
      // Así se duplicaron 951 notas: el import leyó el historial, la consulta
      // falló, recibió [] y creó de cero las asignaturas ya aprobadas de un
      // aula entera (caso 2026-07-29/30). Se reintenta y, si no, se rompe.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: any[] | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let last: any = null
      for (let intento = 0; intento < 3 && rows == null; intento++) {
        if (intento) await new Promise(r => setTimeout(r, 300 * intento))
        const { data, error } = await sb.from(table).select(select)
          .in(column, part).order(orderBy).range(from, from + 999)
        if (error) { last = error; continue }
        rows = data ?? []
      }
      if (rows == null) {
        throw new Error(`No se pudo leer ${table} (${part.length} valores de ${column}, página ${from}): ${last?.message ?? 'error desconocido'}`)
      }
      out.push(...rows)
      if (rows.length < 1000) break
    }
  }
  return out
}

export interface GradeChanges {
  final_grade?: number | null
  retake_grade?: number | null
  course_name?: string | null
}

const EDITABLE: (keyof GradeChanges)[] = ['final_grade', 'retake_grade', 'course_name']

export async function applyGradeEdit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  opts: {
    externalId: string
    changes: GradeChanges
    reason: string
    userId: string
    origin?: 'editor' | 'csv' | 'moodle'
  },
): Promise<{ ok: boolean; changed: string[]; note?: string }> {
  const { externalId, changes, reason, userId } = opts
  const origin = opts.origin ?? 'editor'

  const { data: row, error } = await sb.from('academic_grades')
    .select('*').eq('external_id', externalId).maybeSingle()
  if (error) return { ok: false, changed: [], note: error.message }
  if (!row) return { ok: false, changed: [], note: 'Nota no encontrada' }

  // Solo campos editables y solo si de verdad cambian
  const patch: Record<string, unknown> = {}
  const audits: Record<string, unknown>[] = []
  for (const field of EDITABLE) {
    if (!(field in changes)) continue
    const next = changes[field] ?? null
    const prev = row[field] ?? null
    if (String(prev ?? '') === String(next ?? '')) continue
    patch[field] = next
    audits.push({
      grade_external_id: externalId,
      document_number: row.document_number,
      course_name: row.course_name,
      field,
      old_value: prev == null ? null : String(prev),
      new_value: next == null ? null : String(next),
      reason, origin, changed_by: userId,
    })
  }
  if (!audits.length) return { ok: true, changed: [], note: 'Sin cambios' }

  const { error: aErr } = await sb.from('grade_audit').insert(audits)
  if (aErr) return { ok: false, changed: [], note: 'Auditoría: ' + aErr.message }

  patch.edited_at = new Date().toISOString()
  patch.edited_by = userId
  const { error: uErr } = await sb.from('academic_grades').update(patch).eq('external_id', externalId)
  if (uErr) return { ok: false, changed: [], note: uErr.message }

  // El estado de su matrícula por asignatura, que es de donde leen los
  // egresados y los carruseles. Sin esto, corregir un 40 a 85 dejaba la nota
  // aprobada y la matrícula en 'reprobada' hasta el cron de las 4:45.
  await sincronizarEstadoDeMatricula(sb, externalId)

  // Efectos inmediatos: egreso/situación y avance de carrusel (una nota
  // cerrada puede completar el carrusel actual). Si fallan no rompen la
  // edición: los crons nocturnos convergen igual.
  if (row.document_number) {
    try { await recomputeStudentByDocument(sb, String(row.document_number)) } catch { /* cron converge */ }
    try {
      const { data: studs } = await sb.from('academic_students')
        .select('id').eq('document_number', row.document_number)
      for (const s of (studs ?? []) as { id: string }[]) {
        await advanceCarousels(sb, { studentId: s.id })
      }
    } catch { /* cron converge */ }
  }

  return { ok: true, changed: audits.map(a => String(a.field)) }
}

// ---------------------------------------------------------------------------
// Importación masiva (Moodle / CSV). Upsert por external_id con auditoría de
// lo que de verdad cambia. NO recalcula por estudiante (para cientos de filas
// sería lentísimo): el llamador corre los recálculos globales al final.
// El trigger protect_edited_grades garantiza que una fila corregida a mano
// jamás se pisa, también aquí.
// ---------------------------------------------------------------------------
export interface ImportRow {
  external_id: string
  document_number: string | null
  email?: string | null
  student_name?: string | null
  course_code?: string | null
  course_name: string | null
  // La asignatura de la malla. NO es opcional de verdad: quien importa ya la
  // resolvió —aula de Moodle → moodle_course_links → academic_courses— y con
  // ella abre la matrícula. Faltaba aquí, y por eso 48 notas de Moodle nacieron
  // sin asignatura: el upsert solo toca las columnas que se le pasan, así que
  // las filas que ya venían de SystemActiva conservaban su course_id y solo se
  // rompían las que el importador insertaba por primera vez. El acta lo tapaba
  // cayendo a comparar por nombre.
  course_id?: string | null
  credits?: number | null
  term_year?: number | null
  term_block?: string | null
  // El semestre real. Año y bloque se conservan como dato crudo, pero el orden
  // temporal se decide con esto.
  semester_id?: string | null
  final_grade: number | null
  passing_score?: number | null
  // Estado académico calculado del detalle: cuánto del curso está rendido, qué
  // estado se deduce, y cuándo cambió por última vez una nota del detalle.
  rendido_pct?: number | null
  estado_academico?: string | null
  last_evaluated_at?: string | null
  // Blinda la fila contra el sync de N8N (escribe edited_at). Se usa al
  // RELLENAR una fila "en curso" heredada de SystemActiva: sin el blindaje,
  // el sync nocturno la revertiría a null porque en Activa sigue vacía.
  shield?: boolean
  // Número de intento. 1 = original; 2+ = recursado (se etiqueta "Recursado N-1").
  intento?: number
}

// ---------------------------------------------------------------------------
// ¿Dónde debe aterrizar una nota importada para este estudiante y asignatura?
// La regla es de PROPIEDAD de la fila:
//   - fila escrita por una importación anterior (source moodle/csv, o el mismo
//     external_id) → 'update': las notas CAMBIAN en Moodle (segundos intentos,
//     correcciones del docente) y cada corrida debe reflejarlo
//   - fila histórica CON valor (Activa, manual) → 'skip': no se duplica ni se
//     toca; correcciones solo por el editor
//   - fila SIN valor ("en curso" de Activa) → 'fill': se reutiliza SU
//     external_id y se blinda contra el sync de N8N
//   - no existe → 'new' con el external_id propio de la importación
// studentRows = filas de academic_grades del estudiante (se filtran aquí las
// convalidaciones).
// ---------------------------------------------------------------------------
export function resolveImportTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  studentRows: any[],
  course: { id?: string | null; code: string | null; name: string | null },
  fallbackExternalId: string,
  // Mínimo de la CATEGORÍA del programa. El importador ya lo resuelve; antes
  // aquí había un 70 fijo, que en Master y Doctorado daba por aprobado un 75.
  categoryPassing: number | null = null,
  // Evidencia del intento que se está importando: cuánto rindió y de qué
  // periodo es. Sin ella no se abre un recursado.
  intentoNuevo?: { rendido_pct?: number | null; term_year?: number | null; semester_start?: string | null },
): { action: 'skip' | 'fill' | 'new' | 'update' | 'retake'; external_id: string; shield: boolean; prev_value: number | null; intento?: number } {
  // Qué filas del estudiante son de ESTA asignatura. Por course_id, y por
  // nombre solo cuando la fila no lo trae.
  //
  // Aquí también estaba el `código O nombre`, y aquí hacía el daño más caro: el
  // importador decidía que la nota ya estaba registrada. A Francisca Ávila, con
  // dos programas numerados 101–105, el 98 de Psychopathological Alterations
  // (Mental Health, código 101) daba por aprobado el Early Detection de ABA
  // (código 101), así que su 86,67 del aula 437 no entraba nunca: el aula decía
  // "5 en curso" y la vista previa "ya registrada (histórico)".
  const matches = (studentRows ?? [])
    .filter(g => g.source !== 'convalidacion' && g.source !== 'validacion')
    .filter(g => filaDeCurso(g, course))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const val = (g: any): number | null => g.retake_grade ?? g.final_grade ?? null

  // Una asignatura ya APROBADA en el histórico (Activa/manual) manda SIEMPRE:
  // no se crea ni se mantiene una fila de recursado. Las aulas Moodle se
  // reutilizan entre cohortes y el import trae a TODOS los matriculados del
  // aula — sin esta guardia, un alumno de una cohorte pasada (p. ej. upgrade)
  // que sigue matriculado en el aula recibe una fila "en curso" duplicando la
  // asignatura que ya aprobó (caso detectado 2026-07-28: 1,841 filas).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aprobada = (g: any): boolean => {
    if (g.source === 'moodle' || g.source === 'csv') return false
    const v = val(g)
    const min = categoryPassing ?? (g.passing_score != null ? Number(g.passing_score) : null)
    return v != null && min != null && v >= min
  }
  const historicOk = matches.find(aprobada)
  if (historicOk) return { action: 'skip', external_id: String(historicOk.external_id), shield: false, prev_value: val(historicOk) }

  const own = matches.find(m => String(m.external_id) === fallbackExternalId)
    ?? matches.find(m => m.source === 'moodle' || m.source === 'csv')
  if (own) {
    // shield: la fila rellenada sobre un external_id de Activa necesita seguir
    // blindada contra N8N; las nacidas de importación (source moodle/csv) no
    // (N8N nunca las toca). El external_id ya no dice el origen: lo dice source.
    const shield = !(own.source === 'moodle' || own.source === 'csv')
    return { action: 'update', external_id: String(own.external_id), shield, prev_value: val(own) }
  }
  // ── Recursado ────────────────────────────────────────────────────────────
  //
  // Una fila histórica DESAPROBADA no bloquea: el estudiante puede volver a
  // cursar la asignatura, y esa segunda vuelta es una nota nueva, no una
  // corrección de la primera.
  //
  // Antes cualquier fila con valor devolvía 'skip', así que un recursado no se
  // escribía en ninguna parte. Se descubrió con tres estudiantes de Accounting
  // que estaban recursando Interpersonal Communication: sus notas solo existían
  // porque el aula estaba mal identificada y caían en otra asignatura, donde no
  // había fila que las bloqueara. El error nos estaba tapando el hueco.
  //
  // El intento anterior se conserva —desaprobar es un hecho y el seguimiento lo
  // necesita— y el acta se queda con el MEJOR de los dos (regla del usuario,
  // 2026-08-11), que es lo que ya hacía cuando encontraba varias notas.
  //
  // Solo se abre intento nuevo cuando SABEMOS que la anterior está desaprobada:
  // hace falta una nota mínima conocida. Sin ella no se adivina — se respeta la
  // fila que ya existe, como hasta ahora.
  const desaprobada = (g: any): boolean => {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const v = val(g)
    const min = categoryPassing ?? (g.passing_score != null ? Number(g.passing_score) : null)
    return v != null && min != null && Number(v) < Number(min)
  }
  const previa = matches.find(desaprobada)
  // Un recursado exige EVIDENCIA POSITIVA de que hay un intento nuevo. Que no
  // haya una nota aprobada que lo bloquee no es evidencia de nada.
  //
  // Sin esta exigencia la regla abrió 147 intentos en una sola corrida y solo
  // 4 eran reales: las aulas se reutilizan entre cohortes, así que un
  // estudiante de una promoción vieja sigue matriculado y el aula reporta un
  // total de 0. 74 de esos 147 no tenían NINGUNA evaluación rendida, y 23
  // decían ser un "intento nuevo" de un año ANTERIOR al original.
  //
  // Es el espejo del caso que el código ya cubría para las aprobadas (1.841
  // filas duplicadas el 28-07). Dos condiciones, las dos comprobables:
  //   · el estudiante RINDIÓ algo en el aula (rendido_pct > 0)
  //   · y el periodo del intento nuevo es POSTERIOR al del anterior
  // Si el periodo de cualquiera de los dos se desconoce, no se abre nada: un
  // dato que falta no autoriza a crear una nota.
  if (previa) {
    const rindio = Number(intentoNuevo?.rendido_pct ?? 0) > 0
    // El "después" se mide con el SEMESTRE cuando se conoce. El año suelto
    // mentía: el aula 155 tiene oferta en dos años y term_year de las notas de
    // Activa contradice al bloque en 6.747 filas, así que "posterior" nunca se
    // cumplía y la regla quedó muerta el día que se escribió.
    const previoOrden = previa.semester_start ?? (previa.term_year != null ? String(previa.term_year) : null)
    const nuevoOrden = intentoNuevo?.semester_start ?? (intentoNuevo?.term_year != null ? String(intentoNuevo.term_year) : null)
    const posterior = previoOrden != null && nuevoOrden != null && String(nuevoOrden) > String(previoOrden)
    if (rindio && posterior) {
      const intento = Math.max(...matches.map(m => Number(m.intento ?? 1)), 1) + 1
      return {
        action: 'retake', external_id: retakeExternalId(fallbackExternalId, intento),
        shield: false, prev_value: val(previa), intento,
      }
    }
  }

  const valued = matches.find(g => val(g) != null)
  if (valued) return { action: 'skip', external_id: String(valued.external_id), shield: false, prev_value: val(valued) }
  if (matches.length) return { action: 'fill', external_id: String(matches[0].external_id), shield: true, prev_value: null }
  return { action: 'new', external_id: fallbackExternalId, shield: false, prev_value: null }
}

// external_id del intento N. Determinista: re-importar el mismo recursado no
// crea una fila más cada vez.
export function retakeExternalId(base: string, intento: number): string {
  return stableUuid(`retake:${base}:${intento}`)
}

// "Recursado 1" es el segundo intento. El primero no lleva etiqueta.
export function etiquetaIntento(intento: number | null | undefined): string | null {
  const n = Number(intento ?? 1)
  return n > 1 ? `Recursado ${n - 1}` : null
}

export async function importGrades(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  rows: ImportRow[],
  opts: { origin: 'moodle' | 'csv'; reason: string; userId: string },
): Promise<{ inserted: number; updated: number; unchanged: number; protected_rows: number; locked_rows: number; errors: string[] }> {
  const out = { inserted: 0, updated: 0, unchanged: 0, protected_rows: 0, locked_rows: 0, errors: [] as string[] }
  if (!rows.length) return out

  // Estado actual de las filas que vamos a tocar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = new Map<string, any>()
  const ids = rows.map(r => r.external_id)
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('academic_grades')
      .select('external_id, final_grade, retake_grade, edited_at, locked_at, course_id').in('external_id', ids.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (data ?? []) as any[]) existing.set(g.external_id, g)
  }

  // Filas con edited_at: puede ser el blindaje de una importación anterior
  // (actualizable por la importación) o una corrección de Registros por el
  // editor (intocable). Lo distingue el ORIGEN del último cambio auditado.
  const editedIds = rows
    .map(r => r.external_id)
    .filter(id => existing.get(id)?.edited_at)
  const lastOrigin = new Map<string, string>()
  for (let i = 0; i < editedIds.length; i += 200) {
    const { data } = await sb.from('grade_audit')
      .select('grade_external_id, origin, changed_at')
      .in('grade_external_id', editedIds.slice(i, i + 200))
      .order('changed_at', { ascending: false })
    for (const a of (data ?? []) as { grade_external_id: string; origin: string }[]) {
      if (!lastOrigin.has(a.grade_external_id)) lastOrigin.set(a.grade_external_id, a.origin)
    }
  }

  const toWrite: ImportRow[] = []
  const audits: Record<string, unknown>[] = []
  for (const r of rows) {
    const prev = existing.get(r.external_id)
    let row = r
    if (prev) {
      if (prev.locked_at) { out.locked_rows++; continue }     // acta cerrada: intocable por importación
      if (String(prev.final_grade ?? '') === String(r.final_grade ?? '')) { out.unchanged++; continue }
      // Una fila VACIADA a mano no se protege: no hay corrección que defender.
      // Registros la vacía precisamente para que la importación la llene, y
      // saltarla aquí convertía ese gesto en lo contrario de lo que significa.
      // Misma regla que el trigger protect_edited_grades (v4), pero este filtro
      // vive en el código y actuaba ANTES de que la base pudiera opinar.
      const teniaNota = prev.final_grade != null || prev.retake_grade != null
      if (prev.edited_at && teniaNota) {
        const origen = lastOrigin.get(r.external_id)
        if (!origen || origen === 'editor') { out.protected_rows++; continue }  // corrección de Registros: intocable
        row = { ...r, shield: true }  // blindaje de importación: se actualiza y se re-blinda
      }
      out.updated++
    } else out.inserted++
    toWrite.push(row)
    audits.push({
      grade_external_id: r.external_id,
      document_number: r.document_number,
      course_name: r.course_name,
      field: 'final_grade',
      old_value: prev ? (prev.final_grade == null ? null : String(prev.final_grade)) : null,
      new_value: r.final_grade == null ? null : String(r.final_grade),
      reason: opts.reason, origin: opts.origin, changed_by: opts.userId,
    })
  }

  for (let i = 0; i < audits.length; i += 200) {
    const { error } = await sb.from('grade_audit').insert(audits.slice(i, i + 200))
    if (error) { out.errors.push('auditoría: ' + error.message); return out }
  }
  for (let i = 0; i < toWrite.length; i += 200) {
    const batch = toWrite.slice(i, i + 200).map(r => ({
      external_id: r.external_id,
      document_number: r.document_number,
      email: r.email ?? null,
      student_name: r.student_name ?? null,
      course_code: r.course_code ?? null,
      course_name: r.course_name,
      // Nunca a null si la fila ya tenía asignatura: un importador que no la
      // resuelva no puede borrar la que ya estaba escrita.
      course_id: r.course_id ?? existing.get(r.external_id)?.course_id ?? null,
      credits: r.credits ?? null,
      term_year: r.term_year ?? null,
      term_block: r.term_block ?? null,
      semester_id: r.semester_id ?? null,
      final_grade: r.final_grade,
      passing_score: r.passing_score ?? null,
      rendido_pct: r.rendido_pct ?? null,
      estado_academico: r.estado_academico ?? null,
      last_evaluated_at: r.last_evaluated_at ?? null,
      source: opts.origin,
      // 1 = primer intento; 2+ = recursado. Va explícito y no se deduce de
      // cuántas filas haya: con tres intentos, deducirlo dejaría de funcionar.
      intento: r.intento ?? 1,
      synced_at: new Date().toISOString(),
      // shield=true blinda contra el sync N8N; null es inocuo: las filas
      // editadas a mano ya fueron saltadas antes de llegar aquí.
      edited_at: r.shield ? new Date().toISOString() : null,
    }))
    const { error } = await sb.from('academic_grades').upsert(batch, { onConflict: 'external_id' })
    if (error) { out.errors.push(error.message); return out }
  }
  return out
}
