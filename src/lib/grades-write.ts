import { recomputeStudentByDocument } from './graduates'
import { advanceCarousels } from './carousel'

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
