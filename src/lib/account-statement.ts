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
  concept_abbr: string
  concept_name: string
  convocatoria: string | null
  status: 'pagada' | 'parcial' | 'vencida' | 'pendiente'
}

export interface PaymentRow {
  id: string
  charge_external_id: string | null
  amount: number
  paid_date: string | null
  receipt_number: number | null
  transaction_reference: string | null
  payment_type: number | null
  is_discount: boolean
}

export interface Totals { charged: number; paid: number; discounts: number; balance: number; overdue: number }

// Una cuenta económica independiente por programa (enrollment) en que participa el estudiante.
export interface ProgramAccount {
  enrollment_id: string | null
  convocatoria_id: string | null
  program_name: string
  // Precio oficial congelado en la matrícula (tarifario regulado):
  // list_price = credit_rate × créditos del programa
  credit_rate: number | null
  list_price: number | null
  // Beca activa: solo el PORCENTAJE es dato; el monto se deriva de la base
  scholarship_pct: number | null
  totals: Totals
  charges: ChargeRow[]
  payments: PaymentRow[]
}

export interface Statement {
  student: { id: string; name: string; document_number: string | null; email: string | null } | null
  programs: ProgramAccount[]
}

const empty: Statement = { student: null, programs: [] }

function fullName(r: { first_name?: string; last_name?: string; second_last_name?: string }): string {
  return [r.first_name, r.last_name, r.second_last_name].filter(Boolean).join(' ')
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Estado de cuenta de un estudiante, agrupado por programa (cuenta económica independiente). */
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

  // Matrículas del estudiante (una cuenta por cada una, aunque no tenga cuotas aún)
  const { data: enrData } = await sb.from('academic_student_enrollments')
    .select('id, convocatoria_id, credit_rate, list_price, academic_programs(name)')
    .eq('student_id', student.id)

  // Beca activa por matrícula (el monto SIEMPRE se deriva: % × lista vigente)
  const scholarshipPct = new Map<string, number>()
  try {
    const { data: sch } = await sb.from('scholarships')
      .select('enrollment_id, percentage').eq('student_id', student.id).is('revoked_at', null)
    for (const s of (sch ?? []) as { enrollment_id: string; percentage: number }[]) {
      scholarshipPct.set(String(s.enrollment_id), Number(s.percentage))
    }
  } catch { /* tabla aún sin migrar */ }

  // Conceptos editables (Installment.Type -> abreviatura + nombre)
  const { data: conceptData } = await sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge')
  const conceptByType = new Map<number, { abbr: string | null; name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (conceptData ?? []) as any[]) conceptByType.set(c.type_code, { abbr: c.abbr, name: c.name })
  const conceptAbbr = (t: number | null) => (t == null ? '—' : conceptByType.get(t)?.abbr || `T${t}`)
  const conceptName = (t: number | null) => (t == null ? '—' : conceptByType.get(t)?.name || `Tipo ${t}`)

  // Cuotas y pagos
  const [{ data: chData }, { data: pyData }] = await Promise.all([
    sb.from('account_charges')
      .select('id, external_id, enrollment_id, amount, due_date, charge_type, convocatorias(name)')
      .eq('student_id', student.id),
    sb.from('account_payments')
      .select('id, amount, paid_date, receipt_number, transaction_reference, payment_type, charge_external_id, series_code')
      .eq('student_id', student.id),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chargesRaw = (chData ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentsRaw = (pyData ?? []) as any[]

  const enrollmentByCharge = new Map<string, string | null>()
  for (const c of chargesRaw) enrollmentByCharge.set(c.external_id, c.enrollment_id ?? null)

  const paidByCharge = new Map<string, number>()
  for (const p of paymentsRaw) {
    if (!p.charge_external_id) continue
    paidByCharge.set(p.charge_external_id, (paidByCharge.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))
  }

  const today = new Date().toISOString().slice(0, 10)
  const groups = new Map<string, ProgramAccount>()
  const newGroup = (enr: string | null, conv: string | null, name: string, rate: number | null = null, list: number | null = null): ProgramAccount => ({
    enrollment_id: enr, convocatoria_id: conv, program_name: name,
    credit_rate: rate, list_price: list,
    scholarship_pct: enr ? (scholarshipPct.get(enr) ?? null) : null,
    totals: { charged: 0, paid: 0, discounts: 0, balance: 0, overdue: 0 }, charges: [], payments: [],
  })

  // Un grupo por cada matrícula (aunque no tenga cuotas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enrData ?? []) as any[]) {
    groups.set(e.id, newGroup(e.id, e.convocatoria_id ?? null, e.academic_programs?.name ?? 'Programa',
      e.credit_rate != null ? Number(e.credit_rate) : null, e.list_price != null ? Number(e.list_price) : null))
  }
  const ensureOrphan = () => {
    let g = groups.get('∅')
    if (!g) { g = newGroup(null, null, 'Sin programa'); groups.set('∅', g) }
    return g
  }
  const groupFor = (enr: string | null) => (enr && groups.has(enr) ? groups.get(enr)! : ensureOrphan())

  // Cuotas
  for (const c of chargesRaw) {
    const amount = Number(c.amount ?? 0)
    const paid = paidByCharge.get(c.external_id) ?? 0
    const balance = r2(amount - paid)
    let status: ChargeRow['status']
    if (balance <= 0.005) status = 'pagada'
    else if (paid > 0.005) status = 'parcial'
    else if (c.due_date && c.due_date <= today) status = 'vencida'
    else status = 'pendiente'

    const g = groupFor(c.enrollment_id ?? null)
    g.charges.push({
      id: c.id, external_id: c.external_id, amount, paid: r2(paid), balance,
      due_date: c.due_date, charge_type: c.charge_type,
      concept_abbr: conceptAbbr(c.charge_type), concept_name: conceptName(c.charge_type),
      convocatoria: c.convocatorias?.name ?? null, status,
    })
    g.totals.charged += amount
    if ((status === 'vencida' || status === 'parcial') && c.due_date && c.due_date <= today) g.totals.overdue += balance
  }

  // Pagos (atribuidos a su programa vía la cuota). Los DESCUENTOS reducen la
  // deuda como un pago, pero se suman en su propia columna (no son ingreso).
  for (const p of paymentsRaw) {
    const enr = p.charge_external_id ? enrollmentByCharge.get(p.charge_external_id) ?? null : null
    const g = groupFor(enr)
    const amount = Number(p.amount ?? 0)
    const esDescuento = p.series_code === 'DESCUENTO'
    g.payments.push({
      id: p.id, charge_external_id: p.charge_external_id ?? null, amount, paid_date: p.paid_date,
      receipt_number: p.receipt_number, transaction_reference: p.transaction_reference, payment_type: p.payment_type,
      is_discount: esDescuento,
    })
    if (esDescuento) g.totals.discounts += amount
    else g.totals.paid += amount
  }

  // Descartar el grupo huérfano si quedó vacío
  const orphan = groups.get('∅')
  if (orphan && orphan.charges.length === 0 && orphan.payments.length === 0) groups.delete('∅')

  const programs = [...groups.values()].map(g => {
    g.charges.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    g.payments.sort((a, b) => (b.paid_date ?? '').localeCompare(a.paid_date ?? ''))
    g.totals = {
      charged: r2(g.totals.charged), paid: r2(g.totals.paid), discounts: r2(g.totals.discounts),
      balance: r2(g.totals.charged - g.totals.paid - g.totals.discounts), overdue: r2(g.totals.overdue),
    }
    return g
  }).sort((a, b) => a.program_name.localeCompare(b.program_name))

  return { student, programs }
}
