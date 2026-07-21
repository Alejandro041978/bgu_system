import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Vencimiento de la cuota i (0-based) a partir de first_due_date, respetando due_day (clamp a fin de mes).
function dueDate(first: string, i: number, dueDay: number | null): string {
  const [y, m, d] = first.split('-').map(Number)
  const day = dueDay ?? d
  const target = new Date(Date.UTC(y, m - 1 + i, 1))
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, daysInMonth))
  return target.toISOString().slice(0, 10)
}

/**
 * Genera las cuotas de una matrícula desde la plantilla (programa + convocatoria).
 * Idempotente: si la matrícula ya tiene cuotas, no hace nada.
 */
export async function generateChargesForEnrollment(
  enrollmentId: string
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const sb = admin()

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, convocatoria_id')
    .eq('id', enrollmentId).maybeSingle()
  if (!enr) return { ok: false, error: 'Matrícula no encontrada' }
  if (!enr.convocatoria_id) return { ok: false, error: 'La matrícula no tiene convocatoria' }

  // Idempotencia: no regenerar si ya tiene cuotas
  const { count } = await sb.from('account_charges')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enr.id)
  if ((count ?? 0) > 0) return { ok: false, error: 'La matrícula ya tiene cuotas generadas' }

  const { data: plan } = await sb.from('billing_plans')
    .select('*')
    .eq('program_id', enr.program_id).eq('convocatoria_id', enr.convocatoria_id).maybeSingle()
  if (!plan) return { ok: false, error: 'No hay plantilla para este programa y convocatoria' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  const base = {
    student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, source: 'erp',
  }

  if (Number(plan.registration_fee) > 0) {
    rows.push({
      ...base, external_id: crypto.randomUUID(),
      amount: Number(plan.registration_fee), due_date: null, charge_type: plan.registration_concept ?? null,
      is_initial: true,   // concepto inicial: su pago activa la matrícula
    })
  }

  const n = Number(plan.installments_count) || 0
  if (n > 0 && Number(plan.installment_amount) > 0 && plan.first_due_date) {
    for (let i = 0; i < n; i++) {
      rows.push({
        ...base, external_id: crypto.randomUUID(),
        amount: Number(plan.installment_amount),
        due_date: dueDate(String(plan.first_due_date).slice(0, 10), i, plan.due_day ?? null),
        charge_type: plan.installment_concept ?? null,
      })
    }
  }

  if (rows.length === 0) return { ok: false, error: 'La plantilla no define montos' }

  const { error } = await sb.from('account_charges').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true, created: rows.length }
}
