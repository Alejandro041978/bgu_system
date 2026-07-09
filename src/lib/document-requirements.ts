import { createClient } from '@supabase/supabase-js'

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

  // Egresado: 100% de la malla aprobada
  if (kinds.has('graduated')) {
    if (!programId || !stu?.document_number) out.push({ kind: 'graduated', ok: null, note: 'Requiere programa' })
    else {
      const { data: courses } = await sb.from('academic_courses').select('name').eq('program_id', programId)
      const malla = new Set<string>((courses ?? []).map((c: { name: string }) => (c.name ?? '').toLowerCase().trim()).filter(Boolean))
      const { data: grades } = await sb.from('academic_grades')
        .select('course_name, final_grade, retake_grade, passing_score').eq('document_number', stu.document_number)
      const approved = new Set<string>()
      for (const g of grades ?? []) {
        const val = g.retake_grade ?? g.final_grade
        if (val != null && g.passing_score != null && Number(val) >= Number(g.passing_score)) {
          approved.add((g.course_name ?? '').toLowerCase().trim())
        }
      }
      const cubiertas = [...malla].filter(m => approved.has(m)).length
      const ok = malla.size > 0 && cubiertas === malla.size
      out.push({ kind: 'graduated', ok, note: `${cubiertas}/${malla.size} asignaturas aprobadas` })
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
