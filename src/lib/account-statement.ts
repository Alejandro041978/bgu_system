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
  reference: string | null
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
  // Solo los pagos legacy de SystemActiva (sin confirmación Flywire ni Books)
  // se pueden borrar para reemplazarlos por el camino correcto.
  deletable: boolean
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
  // Bono activo (%): se aplica sobre lo que resta DESPUÉS de la beca
  bonus_pct: number | null
  // Bono de MONTO FIJO (Cashpay). Excluyente con bonus_pct: el beneficio es una
  // cifra aprobada, no una proporción, y derivar el porcentaje lo haría flotar
  // si mañana cambia la beca o una convalidación.
  bonus_amount: number | null
  // Créditos convalidados/validados en el programa (Transfer Credit Savings =
  // créditos × tarifa por crédito de la matrícula)
  transfer_credits: number | null
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
// Total Tuition = precio oficial − ahorro por convalidación − beca − bono.
// Regla del usuario (2026-07-23): el ahorro TC se resta PRIMERO, la beca se
// calcula sobre (lista − ahorro), y el bono sobre lo que resta tras la beca.
//
// Vive aquí, junto a los datos, porque la calculan dos sitios: la cabecera del
// estado de cuenta y la refacturación de cuotas. Si cada uno la escribiera, un
// día dirían totales distintos y nadie sabría cuál creer.
export function computeTuition(a: Pick<ProgramAccount, 'list_price' | 'credit_rate' | 'transfer_credits' | 'scholarship_pct' | 'bonus_pct' | 'bonus_amount'>):
  { lista: number; ahorro: number; beca: number; bonus: number; total: number } | null {
  if (a.list_price == null) return null
  const lista = Number(a.list_price)
  const ahorro = a.transfer_credits != null && a.credit_rate != null
    ? Math.round(Number(a.transfer_credits) * Number(a.credit_rate) * 100) / 100 : 0
  const becaBase = Math.max(0, lista - ahorro)
  const beca = a.scholarship_pct != null ? Math.round(becaBase * Number(a.scholarship_pct)) / 100 : 0
  const afterBeca = Math.round((lista - ahorro - beca) * 100) / 100
  // Monto fijo manda sobre porcentaje. Se topa en lo que resta tras la beca:
  // un bono mayor que la deuda dejaría el total en negativo.
  const bonus = a.bonus_amount != null
    ? Math.min(Math.round(Number(a.bonus_amount) * 100) / 100, afterBeca)
    : a.bonus_pct != null ? Math.round(afterBeca * Number(a.bonus_pct)) / 100 : 0
  return { lista, ahorro, beca, bonus, total: Math.round((afterBeca - bonus) * 100) / 100 }
}

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
    .select('id, convocatoria_id, program_id, credit_rate, list_price, academic_programs(name)')
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

  // Bono activo por matrícula (se aplica sobre lo que resta tras la beca)
  const bonusPct = new Map<string, number>()
  const bonusAmount = new Map<string, number>()
  try {
    const { data: bon } = await sb.from('bonuses')
      .select('enrollment_id, percentage, amount').eq('student_id', student.id)
    for (const b of (bon ?? []) as { enrollment_id: string; percentage: number | null; amount: number | null }[]) {
      if (b.amount != null) bonusAmount.set(String(b.enrollment_id), Number(b.amount))
      else if (b.percentage != null) bonusPct.set(String(b.enrollment_id), Number(b.percentage))
    }
  } catch { /* tabla aún sin migrar */ }

  // Créditos convalidados/validados por programa (Transfer Credit Savings)
  const transferCreditsByProgram = new Map<string, number>()
  {
    const { data: tcs } = await sb.from('transfer_credits')
      .select('id, dest_program_id').eq('student_id', student.id)
    const tcIds = (tcs ?? []).map((t: { id: string }) => t.id)
    if (tcIds.length) {
      const { data: items } = await sb.from('transfer_credit_items')
        .select('transfer_credit_id, dest_course_id').in('transfer_credit_id', tcIds)
      const courseIds = [...new Set((items ?? []).map((i: { dest_course_id: string | null }) => i.dest_course_id).filter(Boolean))] as string[]
      const creditsByCourse = new Map<string, number>()
      for (let i = 0; i < courseIds.length; i += 200) {
        const { data: cs } = await sb.from('academic_courses').select('id, credits').in('id', courseIds.slice(i, i + 200))
        for (const c of (cs ?? []) as { id: string; credits: number | null }[]) creditsByCourse.set(c.id, Number(c.credits ?? 0))
      }
      const progOfTc = new Map((tcs ?? []).map((t: { id: string; dest_program_id: string | null }) => [t.id, t.dest_program_id]))
      for (const it of (items ?? []) as { transfer_credit_id: string; dest_course_id: string | null }[]) {
        const prog = progOfTc.get(it.transfer_credit_id)
        if (!prog || !it.dest_course_id) continue
        transferCreditsByProgram.set(String(prog), (transferCreditsByProgram.get(String(prog)) ?? 0) + (creditsByCourse.get(it.dest_course_id) ?? 0))
      }
    }
  }

  // Conceptos editables (Installment.Type -> abreviatura + nombre)
  const { data: conceptData } = await sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge')
  const conceptByType = new Map<number, { abbr: string | null; name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (conceptData ?? []) as any[]) conceptByType.set(c.type_code, { abbr: c.abbr, name: c.name })
  const conceptAbbr = (t: number | null) => (t == null ? '—' : conceptByType.get(t)?.abbr || `T${t}`)
  const conceptName = (t: number | null) => (t == null ? '—' : conceptByType.get(t)?.name || `Tipo ${t}`)

  // Cuotas y pagos
  const [chRes, { data: pyData }] = await Promise.all([
    sb.from('account_charges')
      .select('id, external_id, enrollment_id, amount, due_date, charge_type, reference, convocatorias(name)')
      .eq('student_id', student.id),
    // '*' a propósito: distributed_from_payment_id puede no existir todavía si
    // no se corrió distribucion_excedente.sql, y una columna faltante en un
    // select explícito rompe el estado de cuenta entero.
    sb.from('account_payments').select('*').eq('student_id', student.id),
  ])
  // Defensa: si aún no se corrió account_charges_reference.sql, reintentar sin
  // la columna nueva (para no romper toda la página por una columna faltante).
  let chData = chRes.data
  if (chRes.error) {
    const retry = await sb.from('account_charges')
      .select('id, external_id, enrollment_id, amount, due_date, charge_type, convocatorias(name)')
      .eq('student_id', student.id)
    chData = retry.data
  }

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
  const newGroup = (enr: string | null, conv: string | null, name: string, rate: number | null = null, list: number | null = null, tcCredits: number | null = null): ProgramAccount => ({
    enrollment_id: enr, convocatoria_id: conv, program_name: name,
    credit_rate: rate, list_price: list,
    scholarship_pct: enr ? (scholarshipPct.get(enr) ?? null) : null,
    bonus_pct: enr ? (bonusPct.get(enr) ?? null) : null,
    bonus_amount: enr ? (bonusAmount.get(enr) ?? null) : null,
    transfer_credits: tcCredits,
    totals: { charged: 0, paid: 0, discounts: 0, balance: 0, overdue: 0 }, charges: [], payments: [],
  })

  // Un grupo por cada matrícula (aunque no tenga cuotas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enrData ?? []) as any[]) {
    const tc = e.program_id ? (transferCreditsByProgram.get(String(e.program_id)) ?? null) : null
    groups.set(e.id, newGroup(e.id, e.convocatoria_id ?? null, e.academic_programs?.name ?? 'Programa',
      e.credit_rate != null ? Number(e.credit_rate) : null, e.list_price != null ? Number(e.list_price) : null,
      tc && tc > 0 ? tc : null))
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
      reference: c.reference ?? null,
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
    // Borrable = legacy SystemActiva sin respaldo: no FLYWIRE/BOOKS, sin
    // flywire_payment_id (no confirmado por Flywire) y no es un descuento.
    //
    // Y los TROZOS de la migración, que sí llevan flywire_payment_id: Activa
    // partía un giro en un pago por cuota y la migración copió los pedazos con
    // sufijo "(1)", "(2)" en la referencia. Un giro se asocia UNA vez; para
    // rehacer uno mal troceado hay que poder borrar sus pedazos. El sufijo es
    // la firma de la migración —ni el importador ni el webhook lo escriben—,
    // así que esto no destapa ningún pago real. Debe coincidir con el candado
    // de /api/account/payments: si divergen, el botón miente.
    const esTrozo = /\(\d+\)\s*$/.test(String(p.transaction_reference ?? ''))
    // Un abono de distribución siempre se puede deshacer: borrarlo devuelve el
    // importe al pago de origen, no lo destruye. Sin esto una distribución mal
    // hecha sería irreversible.
    const esAbono = !!p.distributed_from_payment_id
    const deletable = !esDescuento && (esAbono
      || (p.series_code !== 'FLYWIRE' && p.series_code !== 'BOOKS' && (!p.flywire_payment_id || esTrozo)))
    g.payments.push({
      id: p.id, charge_external_id: p.charge_external_id ?? null, amount, paid_date: p.paid_date,
      receipt_number: p.receipt_number, transaction_reference: p.transaction_reference, payment_type: p.payment_type,
      is_discount: esDescuento, deletable,
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
