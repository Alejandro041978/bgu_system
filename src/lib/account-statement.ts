import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface ChargeRow {
  id: string
  external_id: string
  amount: number
  paid: number
  balance: number
  due_date: string | null
  charge_type: number | null
  convocatoria: string | null
  status: 'pagada' | 'parcial' | 'vencida' | 'pendiente'
}

export interface PaymentRow {
  id: string
  amount: number
  paid_date: string | null
  receipt_number: number | null
  transaction_reference: string | null
  payment_type: number | null
}

export interface Statement {
  student: { id: string; name: string; document_number: string | null; email: string | null } | null
  totals: { charged: number; paid: number; balance: number; overdue: number }
  charges: ChargeRow[]
  payments: PaymentRow[]
}

const empty: Statement = { student: null, totals: { charged: 0, paid: 0, balance: 0, overdue: 0 }, charges: [], payments: [] }

function fullName(r: { first_name?: string; last_name?: string; second_last_name?: string }): string {
  return [r.first_name, r.last_name, r.second_last_name].filter(Boolean).join(' ')
}

/** Estado de cuenta de un estudiante (cuotas + pagos + saldo). Resuelve por id, documento o email. */
export async function getAccountStatement(
  filter: { studentId?: string | null; documentNumber?: string | null; email?: string | null }
): Promise<Statement> {
  const sb = admin()

  // Resolver el estudiante
  let sq = sb.from('academic_students').select('id, first_name, last_name, second_last_name, document_number, email')
  if (filter.studentId) sq = sq.eq('id', filter.studentId)
  else if (filter.documentNumber) sq = sq.eq('document_number', filter.documentNumber)
  else if (filter.email) sq = sq.eq('email', filter.email)
  else return empty
  const { data: stu } = await sq.maybeSingle()
  if (!stu) return empty

  const student = { id: stu.id, name: fullName(stu), document_number: stu.document_number, email: stu.email }

  // Cuotas y pagos del estudiante
  const [{ data: chData }, { data: pyData }] = await Promise.all([
    sb.from('account_charges')
      .select('id, external_id, amount, due_date, charge_type, convocatorias(name)')
      .eq('student_id', student.id),
    sb.from('account_payments')
      .select('id, amount, paid_date, receipt_number, transaction_reference, payment_type, charge_external_id')
      .eq('student_id', student.id),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentsRaw = (pyData ?? []) as any[]

  // Pagado por cuota (external_id de la cuota)
  const paidByCharge = new Map<string, number>()
  for (const p of paymentsRaw) {
    if (!p.charge_external_id) continue
    paidByCharge.set(p.charge_external_id, (paidByCharge.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
  }

  const today = new Date().toISOString().slice(0, 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const charges: ChargeRow[] = ((chData ?? []) as any[]).map(c => {
    const amount = Number(c.amount ?? 0)
    const paid = paidByCharge.get(c.external_id) ?? 0
    const balance = Math.round((amount - paid) * 100) / 100
    let status: ChargeRow['status']
    if (balance <= 0.005) status = 'pagada'
    else if (paid > 0.005) status = 'parcial'
    else if (c.due_date && c.due_date <= today) status = 'vencida'
    else status = 'pendiente'
    return {
      id: c.id,
      external_id: c.external_id,
      amount,
      paid: Math.round(paid * 100) / 100,
      balance,
      due_date: c.due_date,
      charge_type: c.charge_type,
      convocatoria: c.convocatorias?.name ?? null,
      status,
    }
  }).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  const payments: PaymentRow[] = paymentsRaw
    .map(p => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      paid_date: p.paid_date,
      receipt_number: p.receipt_number,
      transaction_reference: p.transaction_reference,
      payment_type: p.payment_type,
    }))
    .sort((a, b) => (b.paid_date ?? '').localeCompare(a.paid_date ?? ''))

  const charged = charges.reduce((s, c) => s + c.amount, 0)
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const balance = Math.round((charged - paid) * 100) / 100
  const overdue = charges.filter(c => c.status === 'vencida' || c.status === 'parcial')
    .reduce((s, c) => s + (c.due_date && c.due_date <= today ? c.balance : 0), 0)

  return {
    student,
    totals: {
      charged: Math.round(charged * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance,
      overdue: Math.round(overdue * 100) / 100,
    },
    charges,
    payments,
  }
}
