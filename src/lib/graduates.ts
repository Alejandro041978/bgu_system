import { readAll } from './withdrawals'

// ---------------------------------------------------------------------------
// Detección masiva de egresados.
//   Misma regla que el requisito 'graduated' de emisión de documentos
//   (src/lib/document-requirements.ts): una asignatura de la malla está cubierta
//   por convalidación/validación o por una nota aprobatoria. Egresa quien cubre
//   el 100% de las asignaturas OBLIGATORIAS del programa.
//
//   Aquí se resuelve en una sola pasada en memoria: la versión por estudiante
//   hace ~6 consultas cada uno y no escala a un cron sobre 1400 estudiantes.
// ---------------------------------------------------------------------------

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

type GradeRow = {
  document_number: string | null; course_code: string | null; course_name: string | null
  final_grade: number | null; retake_grade: number | null; passing_score: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeGraduates(sb: any): Promise<{
  pairs_checked: number; graduates: number; inserted: number; removed: number
}> {
  // 1) Nota aprobatoria por categoría (fallback cuando la nota no la trae)
  const cats = await readAll(sb, 'academic_programs_category', 'id, passing_score')
  const passingByCat = new Map<string, number | null>()
  for (const c of cats as { id: string; passing_score: number | null }[]) passingByCat.set(c.id, c.passing_score)

  const programs = await readAll(sb, 'academic_programs', 'id, category_id')
  const catOfProgram = new Map<string, string | null>()
  for (const p of programs as { id: string; category_id: string | null }[]) catOfProgram.set(p.id, p.category_id)

  // 2) Malla: sólo asignaturas obligatorias (NULL = obligatoria).
  //    select('*') a propósito: pedir graduation_requirement explícitamente hace
  //    fallar TODA la consulta si la columna aún no existe, y la malla llegaría
  //    vacía en silencio → cero egresados sin ningún error visible.
  const courses = await readAll(sb, 'academic_courses', '*')
  const mallaOf = new Map<string, { id: string; code: string | null; name: string | null }[]>()
  for (const c of courses as { id: string; program_id: string | null; code: string | null; name: string | null; graduation_requirement: boolean | null }[]) {
    if (!c.program_id || c.graduation_requirement === false) continue
    if (!mallaOf.has(c.program_id)) mallaOf.set(c.program_id, [])
    mallaOf.get(c.program_id)!.push({ id: c.id, code: c.code, name: c.name })
  }

  // 3) Estudiantes y notas (indexadas por documento)
  const students = await readAll(sb, 'academic_students', 'id, document_number')
  const docOf = new Map<string, string | null>()
  for (const s of students as { id: string; document_number: string | null }[]) docOf.set(s.id, s.document_number)

  const grades = await readAll(sb, 'academic_grades',
    'document_number, course_code, course_name, final_grade, retake_grade, passing_score, source')
  const gradesByDoc = new Map<string, GradeRow[]>()
  for (const g of grades as (GradeRow & { source: string })[]) {
    // Las convalidaciones/validaciones se cuentan por transfer_credit_items, no aquí
    if (g.source === 'convalidacion' || g.source === 'validacion') continue
    if (!g.document_number) continue
    const k = g.document_number
    if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
    gradesByDoc.get(k)!.push(g)
  }

  // 4) Convalidaciones/validaciones: (student, program) → set de course_id cubiertos
  const tcs = await readAll(sb, 'transfer_credits', 'id, student_id, dest_program_id')
  const items = await readAll(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id')
  const itemsByTc = new Map<string, string[]>()
  for (const it of items as { transfer_credit_id: string; dest_course_id: string | null }[]) {
    if (!it.dest_course_id) continue
    if (!itemsByTc.has(it.transfer_credit_id)) itemsByTc.set(it.transfer_credit_id, [])
    itemsByTc.get(it.transfer_credit_id)!.push(it.dest_course_id)
  }
  const transferOf = new Map<string, Set<string>>() // `${student_id}|${program_id}`
  for (const tc of tcs as { id: string; student_id: string | null; dest_program_id: string | null }[]) {
    if (!tc.student_id || !tc.dest_program_id) continue
    const k = `${tc.student_id}|${tc.dest_program_id}`
    if (!transferOf.has(k)) transferOf.set(k, new Set())
    for (const cid of itemsByTc.get(tc.id) ?? []) transferOf.get(k)!.add(cid)
  }

  // 5) Recorrer cada matrícula (estudiante × programa)
  const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id')
  const seen = new Set<string>()
  const found: { student_id: string; program_id: string; courses_total: number; courses_covered: number }[] = []
  let pairs = 0

  for (const e of enrolls as { student_id: string | null; program_id: string | null }[]) {
    if (!e.student_id || !e.program_id) continue
    const key = `${e.student_id}|${e.program_id}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs++

    const malla = mallaOf.get(e.program_id) ?? []
    if (!malla.length) continue

    const doc = docOf.get(e.student_id)
    const gradeRows = doc ? (gradesByDoc.get(doc) ?? []) : []
    const transferred = transferOf.get(key) ?? new Set<string>()
    const categoryPassing = passingByCat.get(catOfProgram.get(e.program_id) ?? '') ?? null

    let covered = 0
    for (const c of malla) {
      if (transferred.has(c.id)) { covered++; continue }
      const matches = gradeRows.filter(g =>
        (c.code && g.course_code && String(g.course_code) === String(c.code)) ||
        (norm(g.course_name) === norm(c.name) && norm(c.name) !== '')
      )
      const values = matches.map(g => (g.retake_grade ?? g.final_grade)).filter((v): v is number => v != null)
      if (!values.length) continue
      const best = Math.max(...values)
      const bestRow = matches.find(g => Number(g.retake_grade ?? g.final_grade) === best)
      const passing = bestRow?.passing_score ?? categoryPassing
      if (passing == null || best >= Number(passing)) covered++
    }

    if (covered === malla.length) {
      found.push({ student_id: e.student_id, program_id: e.program_id, courses_total: malla.length, courses_covered: covered })
    }
  }

  // 6) Guardar detecciones
  let inserted = 0
  for (let i = 0; i < found.length; i += 200) {
    const chunk = found.slice(i, i + 200)
    await sb.from('student_graduations').upsert(
      chunk.map(f => ({ ...f, detected_at: new Date().toISOString().slice(0, 10) })),
      { onConflict: 'student_id,program_id', ignoreDuplicates: false })
    inserted += chunk.length
  }

  // 7) Retirar detecciones que ya no aplican (p.ej. se agregó una asignatura a la
  //    malla). No se tocan las que ya entraron al proceso de titulación.
  const existing = await readAll(sb, 'student_graduations', 'id, student_id, program_id, titulacion_status')
  const validKeys = new Set(found.map(f => `${f.student_id}|${f.program_id}`))
  const stale = (existing as { id: string; student_id: string; program_id: string; titulacion_status: string }[])
    .filter(g => g.titulacion_status === 'pendiente' && !validKeys.has(`${g.student_id}|${g.program_id}`))
  let removed = 0
  for (let i = 0; i < stale.length; i += 50) {
    const chunk = stale.slice(i, i + 50)
    await Promise.all(chunk.map(g => sb.from('student_graduations').delete().eq('id', g.id)))
    removed += chunk.length
  }

  return { pairs_checked: pairs, graduates: found.length, inserted, removed }
}
