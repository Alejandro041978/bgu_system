import { createClient } from '@supabase/supabase-js'
import { sameCourse } from './course-match'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface ReqCheck { kind: string; ok: boolean | null; note: string }

// Verifica los requisitos automáticos de un documento para un estudiante/programa.
// ok=true cumple, ok=false no cumple, ok=null requiere verificación humana (manual).
export async function checkRequirements(
  studentId: string, programId: string | null, requirements: { kind: string; description?: string }[]
): Promise<ReqCheck[]> {
  const sb = admin()
  const kinds = new Set(requirements.map(r => r.kind))
  const out: ReqCheck[] = []

  const { data: stu } = await sb.from('academic_students').select('document_number').eq('id', studentId).maybeSingle()

  // Sin deuda
  if (kinds.has('no_debt')) {
    const [{ data: ch }, { data: py }] = await Promise.all([
      sb.from('account_charges').select('amount').eq('student_id', studentId),
      sb.from('account_payments').select('amount').eq('student_id', studentId),
    ])
    const charged = (ch ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount ?? 0), 0)
    const paid = (py ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0)
    const balance = Math.round((charged - paid) * 100) / 100
    out.push({ kind: 'no_debt', ok: balance <= 0.005, note: balance <= 0.005 ? 'Sin deuda' : `Saldo pendiente: ${balance.toFixed(2)}` })
  }

  // Matriculado en el programa
  if (kinds.has('enrolled')) {
    if (!programId) out.push({ kind: 'enrolled', ok: null, note: 'Requiere programa' })
    else {
      const { count } = await sb.from('academic_student_enrollments')
        .select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('program_id', programId)
      out.push({ kind: 'enrolled', ok: (count ?? 0) > 0, note: (count ?? 0) > 0 ? 'Matriculado' : 'Sin matrícula en el programa' })
    }
  }

  // Egresado: 100% de la malla cubierta (nota aprobatoria, convalidación o validación)
  if (kinds.has('graduated')) {
    if (!programId || !stu?.document_number) out.push({ kind: 'graduated', ok: null, note: 'Requiere programa' })
    else {
      // Nota aprobatoria de la categoría del programa (fallback)
      const { data: program } = await sb.from('academic_programs').select('category_id').eq('id', programId).maybeSingle()
      let categoryPassing: number | null = null
      if (program?.category_id) {
        const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', program.category_id).maybeSingle()
        categoryPassing = cat?.passing_score ?? null
      }

      // Malla del programa
      const { data: courses } = await sb.from('academic_courses').select('id, code, name').eq('program_id', programId)

      // Notas reales (excluye convalidación y validación)
      const { data: grades } = await sb.from('academic_grades')
        .select('course_code, course_name, final_grade, retake_grade, passing_score')
        .eq('document_number', stu.document_number).neq('source', 'convalidacion').neq('source', 'validacion')

      // Convalidaciones/validaciones del estudiante para este programa (dest_course_id)
      const { data: tcs } = await sb.from('transfer_credits').select('id').eq('student_id', studentId).eq('dest_program_id', programId)
      const tcIds = (tcs ?? []).map((t: { id: string }) => t.id)
      const { data: tItems } = tcIds.length
        ? await sb.from('transfer_credit_items').select('dest_course_id').in('transfer_credit_id', tcIds)
        : { data: [] }
      const transferCourseIds = new Set<string>((tItems ?? []).map((it: { dest_course_id: string }) => it.dest_course_id).filter(Boolean))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gradeRows = (grades ?? []) as any[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mallaCourses = (courses ?? []) as any[]

      let cubiertas = 0
      for (const c of mallaCourses) {
        // Convalidación / validación cubre la asignatura
        if (transferCourseIds.has(c.id)) { cubiertas++; continue }
        // Nota real aprobatoria
        const matches = gradeRows.filter(g =>
          (c.code && g.course_code && String(g.course_code) === String(c.code)) ||
          sameCourse(g.course_name, c.name)
        )
        const values = matches.map(g => (g.retake_grade ?? g.final_grade) as number | null).filter(v => v != null) as number[]
        if (values.length) {
          const best = Math.max(...values)
          const bestRow = matches.find(g => Number(g.retake_grade ?? g.final_grade) === best)
          const passing = bestRow?.passing_score ?? categoryPassing
          if (passing == null || best >= Number(passing)) cubiertas++
        }
      }
      const ok = mallaCourses.length > 0 && cubiertas === mallaCourses.length
      out.push({ kind: 'graduated', ok, note: `${cubiertas}/${mallaCourses.length} asignaturas aprobadas` })
    }
  }

  // Manuales → verificación humana
  for (const r of requirements) {
    if (r.kind === 'manual') out.push({ kind: 'manual', ok: null, note: r.description || 'Verificación manual' })
  }

  return out
}

// ¿Bloquea la solicitud? Sí si algún requisito automático dio ok=false.
export function hasBlockingFailure(checks: ReqCheck[]): boolean {
  return checks.some(c => c.ok === false)
}
