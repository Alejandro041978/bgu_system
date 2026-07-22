import { createClient } from '@supabase/supabase-js'
import { sameCourse } from './course-match'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Prerrequisito de matrícula (regla del usuario 2026-07-22):
//   Master     ← exige Bachelor nuestro egresado/titulado o con ≤2 asignaturas
//   Doctorado  ← exige Master nuestro egresado/titulado o con ≤2 asignaturas
// Solo aplica si el estudiante TIENE matrícula previa en la categoría
// prerrequisito dentro de la institución; con varias, basta que una cumpla.
// ---------------------------------------------------------------------------

export interface PrereqResult {
  aplica: boolean
  cumple?: boolean
  mensaje?: string
  detalle?: { programa: string; estado: string }[]
}

// Asignaturas restantes de la malla de un programa para un estudiante:
// aprobada = nota aprobatoria en el acta (mejor entre final y recuperación)
// o convalidada (transfer_credit_items). Misma lógica que el motor de
// carruseles, a nivel de malla completa.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function remainingCourses(sb: any, studentId: string, programId: string, documentNumber: string | null): Promise<{ total: number; restantes: number }> {
  const { data: malla } = await sb.from('academic_courses')
    .select('id, code, name').eq('program_id', programId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses = (malla ?? []) as any[]
  if (!courses.length) return { total: 0, restantes: 0 }

  // Convalidadas hacia ese programa
  const { data: tcs } = await sb.from('transfer_credits')
    .select('id').eq('student_id', studentId).eq('dest_program_id', programId)
  const transferred = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tcIds = ((tcs ?? []) as any[]).map(t => t.id)
  if (tcIds.length) {
    const { data: items } = await sb.from('transfer_credit_items')
      .select('dest_course_id').in('transfer_credit_id', tcIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of (items ?? []) as any[]) if (it.dest_course_id) transferred.add(it.dest_course_id)
  }

  // Notas del acta (por documento), excluyendo filas de convalidación (ya contadas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let grades: any[] = []
  if (documentNumber) {
    const { data } = await sb.from('academic_grades')
      .select('course_code, course_name, final_grade, retake_grade, passing_score, source')
      .eq('document_number', documentNumber)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grades = ((data ?? []) as any[]).filter(g => g.source !== 'convalidacion' && g.source !== 'validacion')
  }

  let aprobadas = 0
  for (const c of courses) {
    if (transferred.has(c.id)) { aprobadas++; continue }
    const rows = grades.filter(g =>
      (c.code && g.course_code && String(g.course_code) === String(c.code)) || sameCourse(g.course_name, c.name))
    const values = rows.map(g => g.retake_grade ?? g.final_grade).filter((v: number | null): v is number => v != null)
    if (!values.length) continue
    const best = Math.max(...values)
    const bestRow = rows.find(g => Number(g.retake_grade ?? g.final_grade) === best)
    const passing = bestRow?.passing_score ?? null
    if (passing == null || best >= Number(passing)) aprobadas++
  }
  return { total: courses.length, restantes: courses.length - aprobadas }
}

export async function checkEnrollmentPrereq(studentId: string, targetProgramId: string): Promise<PrereqResult> {
  const sb = admin()

  const { data: target } = await sb.from('academic_programs')
    .select('id, name, category:academic_programs_category(name)').eq('id', targetProgramId).maybeSingle()
  const targetCat = target?.category?.name ?? ''
  const nivel = /doctor/i.test(targetCat) ? 'doctorado' : /master/i.test(targetCat) ? 'master' : null
  if (!nivel) return { aplica: false }

  const prereqRegex = nivel === 'master' ? /bachelor/i : /master/i

  const { data: stu } = await sb.from('academic_students')
    .select('id, first_name, last_name, document_number').eq('id', studentId).maybeSingle()
  if (!stu) return { aplica: false }
  const nombre = [stu.first_name, stu.last_name].filter(Boolean).join(' ')

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('program_id, academic_programs(id, name, category:academic_programs_category(name))')
    .eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previos = ((enr ?? []) as any[])
    .filter(e => prereqRegex.test(e.academic_programs?.category?.name ?? ''))
    .map(e => e.academic_programs)
  if (!previos.length) return { aplica: false }

  const detalle: { programa: string; estado: string }[] = []
  let cumple = false
  for (const p of previos) {
    // ¿Egresado o titulado de ese programa?
    const { data: grad } = await sb.from('student_graduations')
      .select('titulacion_status').eq('student_id', studentId).eq('program_id', p.id).maybeSingle()
    if (grad) {
      detalle.push({ programa: p.name, estado: grad.titulacion_status === 'titulado' ? 'titulado' : 'egresado' })
      cumple = true
      continue
    }
    const { total, restantes } = await remainingCourses(sb, studentId, p.id, stu.document_number ? String(stu.document_number) : null)
    detalle.push({ programa: p.name, estado: `le restan ${restantes} de ${total} asignaturas` })
    if (total > 0 && restantes <= 2) cumple = true
  }

  const nivelPrevio = nivel === 'master' ? 'bachelor' : 'maestría'
  const nivelDestino = nivel === 'master' ? 'la maestría' : 'el doctorado'
  const extras = detalle.map(d => `${d.programa}: ${d.estado}`).join('; ')
  return {
    aplica: true,
    cumple,
    detalle,
    mensaje: `${nombre} es estudiante de ${nivelPrevio} y ${cumple ? 'SÍ' : 'NO'} cumple el requisito para inscribirse en ${nivelDestino} (${extras}).`,
  }
}
