import { recomputeStudentByDocument } from './graduates'
import { advanceCarousels } from './carousel'
import { sameCourse } from './course-match'

// ---------------------------------------------------------------------------
// Camino ÚNICO de escritura de notas. Toda modificación — editor manual, carga
// CSV, importación de Moodle — pasa por aquí y hace siempre lo mismo:
//   1. deja rastro en grade_audit (campo, valor anterior/nuevo, quién, por qué)
//   2. marca la fila con edited_at/edited_by, lo que la protege del sync de
//      SystemActiva (que salta filas editadas para no pisar correcciones)
//   3. recalcula al estudiante afectado al instante (egreso y situación),
//      sin esperar al cron nocturno
// ---------------------------------------------------------------------------

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
  credits?: number | null
  term_year?: number | null
  term_block?: string | null
  final_grade: number | null
  passing_score?: number | null
  // Blinda la fila contra el sync de N8N (escribe edited_at). Se usa al
  // RELLENAR una fila "en curso" heredada de SystemActiva: sin el blindaje,
  // el sync nocturno la revertiría a null porque en Activa sigue vacía.
  shield?: boolean
}

// ---------------------------------------------------------------------------
// ¿Dónde debe aterrizar una nota importada para este estudiante y asignatura?
// Evita duplicar lo que ya vino de SystemActiva:
//   - ya existe una fila CON valor → 'skip' (lo histórico de Activa manda; ni
//     se duplica ni se toca; correcciones solo por el editor manual)
//   - existe fila SIN valor ("en curso") → 'fill': se reutiliza SU external_id
//     y se blinda, para que quede UNA sola fila por asignatura
//   - no existe → 'new' con el external_id propio de la importación
// studentRows = filas de academic_grades del estudiante (se filtran aquí las
// convalidaciones).
// ---------------------------------------------------------------------------
export function resolveImportTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  studentRows: any[],
  course: { code: string | null; name: string | null },
  fallbackExternalId: string,
): { action: 'skip' | 'fill' | 'new'; external_id: string; shield: boolean } {
  const matches = (studentRows ?? [])
    .filter(g => g.source !== 'convalidacion' && g.source !== 'validacion')
    .filter(g =>
      (course.code && g.course_code && String(g.course_code) === String(course.code)) ||
      sameCourse(g.course_name, course.name))
  const valued = matches.find(g => (g.retake_grade ?? g.final_grade) != null)
  if (valued) return { action: 'skip', external_id: String(valued.external_id), shield: false }
  if (matches.length) return { action: 'fill', external_id: String(matches[0].external_id), shield: true }
  return { action: 'new', external_id: fallbackExternalId, shield: false }
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
      .select('external_id, final_grade, edited_at, locked_at').in('external_id', ids.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (data ?? []) as any[]) existing.set(g.external_id, g)
  }

  const toWrite: ImportRow[] = []
  const audits: Record<string, unknown>[] = []
  for (const r of rows) {
    const prev = existing.get(r.external_id)
    if (prev) {
      if (prev.locked_at) { out.locked_rows++; continue }     // acta cerrada: intocable por importación
      if (String(prev.final_grade ?? '') === String(r.final_grade ?? '')) { out.unchanged++; continue }
      if (prev.edited_at) { out.protected_rows++; continue }  // el trigger la protegería igual; ni lo intentamos
      out.updated++
    } else out.inserted++
    toWrite.push(r)
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
      credits: r.credits ?? null,
      term_year: r.term_year ?? null,
      term_block: r.term_block ?? null,
      final_grade: r.final_grade,
      passing_score: r.passing_score ?? null,
      source: opts.origin,
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
