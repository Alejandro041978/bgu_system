import { readAll } from './withdrawals'
import { sameCourse } from './course-match'
import { provisionStudent } from './moodle-provision'

// ---------------------------------------------------------------------------
// Motor de carruseles.
//
// Regla (definida por el usuario, 2026-07-17): el estudiante avanza al
// siguiente carrusel SOLO cuando aprueba TODAS las asignaturas del actual
// (aprobatoria o convalidada). Al avanzar se desconecta de las aulas Moodle
// del carrusel que completó y se matricula en las del siguiente. El avance es
// inmediato (se dispara al cerrar una nota) con un cron diario de respaldo.
// El último carrusel (sin next_group_id) no lleva a otro: completarlo
// significa terminar la malla, y de eso ya se encarga la detección de
// egresados.
//
// Un carrusel SIN asignaturas nunca se da por completado: avanzar por vacío
// regalaría el programa entero.
// ---------------------------------------------------------------------------

export interface Advance {
  student_id: string
  student_name: string
  document_number: string | null
  from_group: string
  from_label: string
  to_group: string | null   // null = completó el último carrusel
  to_label: string
}

export interface CarouselResult {
  memberships_checked: number
  advanced: Advance[]
  completed_final: number
  skipped_empty_group: number
  moodle_unenrols: number
  moodle_enrols: number
  errors: string[]
  dry_run: boolean
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function advanceCarousels(sb: any, opts: { studentId?: string; dryRun?: boolean } = {}): Promise<CarouselResult> {
  const dryRun = !!opts.dryRun
  const result: CarouselResult = {
    memberships_checked: 0, advanced: [], completed_final: 0,
    skipped_empty_group: 0, moodle_unenrols: 0, moodle_enrols: 0, errors: [], dry_run: dryRun,
  }

  // Membresías activas (el universo a evaluar)
  let q = sb.from('academic_group_students').select('group_id, student_id, status').eq('status', 'activo')
  if (opts.studentId) q = q.eq('student_id', opts.studentId)
  const { data: membershipsRaw } = await q
  const memberships = (membershipsRaw ?? []) as { group_id: string; student_id: string }[]
  result.memberships_checked = memberships.length
  if (!memberships.length) return result

  // Grupos (todos: la cadena puede llevar a grupos sin miembros todavía)
  const groups = await readAll(sb, 'academic_groups', 'id, program_id, next_group_id, abbreviation, name')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupOf = new Map<string, any>(groups.map((g: { id: string }) => [g.id, g]))
  const labelOf = (gid: string | null): string => {
    if (!gid) return 'EGRESA (último carrusel)'
    const g = groupOf.get(gid)
    return g ? ([g.abbreviation, g.name].filter(Boolean).join(' · ') || gid) : gid
  }

  // Asignaturas de cada grupo (via oferta académica)
  const offs = await readAll(sb, 'semester_offerings', 'group_id, course:academic_courses(id, code, name)')
  const coursesOf = new Map<string, { id: string; code: string | null; name: string | null }[]>()
  for (const o of offs as { group_id: string | null; course: { id: string; code: string | null; name: string | null } | null }[]) {
    if (!o.group_id || !o.course) continue
    if (!coursesOf.has(o.group_id)) coursesOf.set(o.group_id, [])
    coursesOf.get(o.group_id)!.push(o.course)
  }

  // Estudiantes involucrados
  const studentIds = [...new Set(memberships.map(m => m.student_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = new Map<string, any>()
  for (const part of chunk(studentIds, 200)) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').in('id', part)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) students.set(s.id, s)
  }

  // Notas por documento (excluye filas de convalidación: esas cuentan por transfer_credit_items)
  const docs = [...new Set([...students.values()].map(s => String(s.document_number ?? '')).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradesByDoc = new Map<string, any[]>()
  for (const part of chunk(docs, 200)) {
    const { data } = await sb.from('academic_grades')
      .select('document_number, course_code, course_name, final_grade, retake_grade, passing_score, source')
      .in('document_number', part)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (data ?? []) as any[]) {
      if (g.source === 'convalidacion' || g.source === 'validacion') continue
      const k = String(g.document_number)
      if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
      gradesByDoc.get(k)!.push(g)
    }
  }

  // Convalidaciones por (estudiante, programa)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tcs: any[] = []
  for (const part of chunk(studentIds, 200)) {
    const { data } = await sb.from('transfer_credits').select('id, student_id, dest_program_id').in('student_id', part)
    tcs.push(...(data ?? []))
  }
  const tcIds = tcs.map(t => t.id)
  const itemsByTc = new Map<string, string[]>()
  for (const part of chunk(tcIds, 200)) {
    const { data } = await sb.from('transfer_credit_items').select('transfer_credit_id, dest_course_id').in('transfer_credit_id', part)
    for (const it of (data ?? []) as { transfer_credit_id: string; dest_course_id: string | null }[]) {
      if (!it.dest_course_id) continue
      if (!itemsByTc.has(it.transfer_credit_id)) itemsByTc.set(it.transfer_credit_id, [])
      itemsByTc.get(it.transfer_credit_id)!.push(it.dest_course_id)
    }
  }
  const transferredOf = new Map<string, Set<string>>()  // `${student}|${program}`
  for (const t of tcs) {
    if (!t.student_id || !t.dest_program_id) continue
    const k = `${t.student_id}|${t.dest_program_id}`
    if (!transferredOf.has(k)) transferredOf.set(k, new Set())
    for (const cid of itemsByTc.get(t.id) ?? []) transferredOf.get(k)!.add(cid)
  }

  // Nota aprobatoria por categoría (fallback cuando la fila no la trae)
  const cats = await readAll(sb, 'academic_programs_category', 'id, passing_score')
  const passingByCat = new Map<string, number | null>(cats.map((c: { id: string; passing_score: number | null }) => [c.id, c.passing_score]))
  const programs = await readAll(sb, 'academic_programs', 'id, category_id')
  const catOfProgram = new Map<string, string | null>(programs.map((p: { id: string; category_id: string | null }) => [p.id, p.category_id]))

  const approved = (studentId: string, programId: string, c: { id: string; code: string | null; name: string | null }): boolean => {
    if (transferredOf.get(`${studentId}|${programId}`)?.has(c.id)) return true
    const doc = String(students.get(studentId)?.document_number ?? '')
    const rows = (gradesByDoc.get(doc) ?? []).filter(g =>
      (c.code && g.course_code && String(g.course_code) === String(c.code)) ||
      sameCourse(g.course_name, c.name))
    const values = rows.map(g => (g.retake_grade ?? g.final_grade)).filter((v: number | null): v is number => v != null)
    if (!values.length) return false
    const best = Math.max(...values)
    const bestRow = rows.find(g => Number(g.retake_grade ?? g.final_grade) === best)
    const passing = bestRow?.passing_score ?? passingByCat.get(catOfProgram.get(programId) ?? '') ?? null
    return passing == null || best >= Number(passing)
  }

  // Membresías existentes por estudiante (cualquier estado), para no duplicar al avanzar
  const existingByStudent = new Map<string, Map<string, string>>() // student -> group -> status
  for (const part of chunk(studentIds, 200)) {
    const { data } = await sb.from('academic_group_students').select('group_id, student_id, status').in('student_id', part)
    for (const m of (data ?? []) as { group_id: string; student_id: string; status: string }[]) {
      if (!existingByStudent.has(m.student_id)) existingByStudent.set(m.student_id, new Map())
      existingByStudent.get(m.student_id)!.set(m.group_id, m.status)
    }
  }

  // Simulación en memoria con avance en cadena (quien completa dos carruseles
  // seguidos avanza dos veces en la misma corrida).
  const ops: { type: 'complete' | 'enter'; group_id: string; student_id: string }[] = []
  for (const m of memberships) {
    let currentGroup = m.group_id
    let hops = 0
    while (hops++ < 10) {
      const g = groupOf.get(currentGroup)
      if (!g) { result.errors.push(`Grupo ${currentGroup} no existe`); break }
      const courses = coursesOf.get(currentGroup) ?? []
      if (!courses.length) { result.skipped_empty_group++; break }
      const all = courses.every(c => approved(m.student_id, g.program_id, c))
      if (!all) break

      const s = students.get(m.student_id)
      const next = g.next_group_id ?? null
      ops.push({ type: 'complete', group_id: currentGroup, student_id: m.student_id })
      result.advanced.push({
        student_id: m.student_id,
        student_name: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : m.student_id,
        document_number: s?.document_number ?? null,
        from_group: currentGroup, from_label: labelOf(currentGroup),
        to_group: next, to_label: labelOf(next),
      })
      if (!next) { result.completed_final++; break }

      const already = existingByStudent.get(m.student_id)?.get(next)
      if (already === 'activo') break                 // ya estaba en el siguiente
      if (already !== 'completado') {
        ops.push({ type: 'enter', group_id: next, student_id: m.student_id })
        if (!existingByStudent.has(m.student_id)) existingByStudent.set(m.student_id, new Map())
        existingByStudent.get(m.student_id)!.set(next, 'activo')
      }
      currentGroup = next                             // evaluar también el siguiente
    }
  }

  if (dryRun) return result

  // Aplicar: primero la membresía (la verdad del ERP), después Moodle
  // (best-effort: si Moodle falla, el cron reintenta el aprovisionamiento).
  const now = new Date().toISOString()
  for (const op of ops) {
    if (op.type === 'complete') {
      const { error } = await sb.from('academic_group_students')
        .update({ status: 'completado', completed_at: now })
        .eq('group_id', op.group_id).eq('student_id', op.student_id).eq('status', 'activo')
      if (error) { result.errors.push(`complete ${op.group_id}: ${error.message}`); continue }
      const r = await provisionStudent(op.group_id, op.student_id, 'unenrol')
      result.moodle_unenrols += r.enrol_ops
      result.errors.push(...r.errors.map(e => `moodle unenrol: ${e}`))
    } else {
      const { error } = await sb.from('academic_group_students')
        .upsert({ group_id: op.group_id, student_id: op.student_id, status: 'activo' }, { onConflict: 'group_id,student_id' })
      if (error) { result.errors.push(`enter ${op.group_id}: ${error.message}`); continue }
      const r = await provisionStudent(op.group_id, op.student_id, 'enrol')
      result.moodle_enrols += r.enrol_ops
      result.errors.push(...r.errors.map(e => `moodle enrol: ${e}`))
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Colocación en el carrusel de entrada. Para matrículas nuevas (y para la
// colocación masiva inicial, que siempre se simula antes).
// El carrusel de entrada del programa es el que ningún otro apunta. Si el
// programa tiene varias entradas (ej. variantes por idioma), la elección es
// humana: bandeja de colocación en Estudiantes por Convocatoria.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function placeStudentInEntry(sb: any, studentId: string, programId: string): Promise<{ ok: boolean; group_id?: string; note: string }> {
  const { data: gs } = await sb.from('academic_groups').select('id, next_group_id').eq('program_id', programId)
  const groups = (gs ?? []) as { id: string; next_group_id: string | null }[]
  if (!groups.length) return { ok: false, note: 'El programa no tiene carruseles' }
  const pointed = new Set(groups.map(g => g.next_group_id).filter(Boolean))
  const entries = groups.filter(g => !pointed.has(g.id))
  if (entries.length !== 1) return { ok: false, note: `El programa tiene ${entries.length} carruseles de entrada; colocar manualmente en Estudiantes por Convocatoria` }
  const entry = entries[0].id

  const { data: existing } = await sb.from('academic_group_students')
    .select('group_id, status').eq('student_id', studentId).eq('group_id', entry).maybeSingle()
  if (existing) return { ok: true, group_id: entry, note: 'Ya estaba en el carrusel de entrada' }

  const { error } = await sb.from('academic_group_students')
    .insert({ group_id: entry, student_id: studentId, status: 'activo' })
  if (error) return { ok: false, note: error.message }
  await provisionStudent(entry, studentId, 'enrol')
  return { ok: true, group_id: entry, note: 'Colocado en el carrusel de entrada' }
}
