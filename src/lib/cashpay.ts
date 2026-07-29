// ---------------------------------------------------------------------------
// CASHPAY — motor de simulación del beneficio por adelantar cuotas.
//
// Regla del usuario (2026-07-29): el descuento paga TIEMPO ANTICIPADO, no
// número de cuotas. Se toma la cuota MÁS LEJANA del tramo que se adelanta, se
// miden los meses exactos hasta su vencimiento y ese porcentaje (meses × tasa,
// con tope) se aplica a la SUMA de las cuotas adelantadas.
//
// Por qué importa: con planes semanales, contar cuotas daría un descuento
// enorme por poco tiempo real de anticipación. Con esta regla, un plan semanal
// y uno mensual que cubren el mismo horizonte reciben lo mismo.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface CashpaySettings {
  id: string; monthly_rate: number; max_discount: number
  min_months: number; quote_valid_days: number
}
export interface Cuota { external_id: string; amount: number; balance: number; due_date: string; concepto: string | null }
export interface Escenario {
  label: string; charges: string[]; cuotas: number
  months: number; discount_pct: number
  gross: number; discount: number; net: number
  hasta: string   // vencimiento de la cuota más lejana del tramo
}
export interface Simulation {
  elegible: boolean
  motivo: string | null
  overdue: number
  futuras: Cuota[]
  escenarios: Escenario[]
  settings: CashpaySettings
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Meses EXACTOS (con decimales) entre dos fechas. 30.44 días = 1 mes medio. */
export function mesesEntre(desde: Date, hasta: Date): number {
  const dias = (hasta.getTime() - desde.getTime()) / 86400000
  return Math.max(0, Math.round((dias / 30.4375) * 100) / 100)
}

export async function getSettings(sb: SB): Promise<CashpaySettings> {
  const { data } = await sb.from('cashpay_settings')
    .select('id, monthly_rate, max_discount, min_months, quote_valid_days')
    .eq('active', true).lte('effective_from', new Date().toISOString().slice(0, 10))
    .order('effective_from', { ascending: false }).limit(1).maybeSingle()
  return data ?? { id: '', monthly_rate: 0.8, max_discount: 20, min_months: 0, quote_valid_days: 7 }
}

/** Descuento de un tramo: meses hasta la cuota más lejana × tasa, con tope. */
export function calcular(cuotas: Cuota[], s: CashpaySettings, hoy = new Date()): Omit<Escenario, 'label' | 'charges'> | null {
  if (!cuotas.length) return null
  const lejana = cuotas.reduce((a, b) => (a.due_date > b.due_date ? a : b))
  const months = mesesEntre(hoy, new Date(lejana.due_date + 'T00:00:00'))
  const pct = Math.min(Number(s.max_discount), r2(months * Number(s.monthly_rate)))
  const gross = r2(cuotas.reduce((t, c) => t + c.balance, 0))
  const discount = r2(gross * pct / 100)
  return { cuotas: cuotas.length, months, discount_pct: pct, gross, discount, net: r2(gross - discount), hasta: lejana.due_date }
}

/**
 * Simula el beneficio para un estudiante con SUS cuotas reales.
 * Elegible solo si NO tiene vencido: el beneficio adelanta futuro, no perdona atrasos.
 */
export async function simulate(sb: SB, studentId: string): Promise<Simulation> {
  const settings = await getSettings(sb)
  const hoy = new Date()
  const hoyISO = hoy.toISOString().slice(0, 10)

  const { data: charges } = await sb.from('account_charges')
    .select('external_id, amount, due_date, charge_type').eq('student_id', studentId)
  const rows = charges ?? []
  const extIds = rows.map((c: { external_id: string }) => c.external_id)
  const pagado = new Map<string, number>()
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await sb.from('account_payments').select('charge_external_id, amount').in('charge_external_id', extIds.slice(i, i + 300))
    for (const p of data ?? []) pagado.set(p.charge_external_id, (pagado.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
  }
  // Nombre del concepto (solo para mostrar)
  const { data: conceptos } = await sb.from('account_concepts').select('type_code, name')
  const cname = new Map<number, string>((conceptos ?? []).map((c: { type_code: number; name: string }) => [Number(c.type_code), String(c.name)]))

  let overdue = 0
  const futuras: Cuota[] = []
  for (const c of rows) {
    const balance = r2(Number(c.amount || 0) - (pagado.get(c.external_id) ?? 0))
    if (balance <= 0.005) continue
    if (!c.due_date || c.due_date <= hoyISO) { overdue += balance; continue }
    futuras.push({ external_id: c.external_id, amount: Number(c.amount || 0), balance, due_date: c.due_date, concepto: cname.get(Number(c.charge_type)) ?? null })
  }
  futuras.sort((a, b) => a.due_date.localeCompare(b.due_date))

  if (overdue > 0.005) {
    return { elegible: false, motivo: 'Tienes cuotas vencidas. Regularízalas y luego podrás adelantar tus cuotas futuras con descuento.', overdue: r2(overdue), futuras, escenarios: [], settings }
  }
  if (!futuras.length) {
    return { elegible: false, motivo: 'No tienes cuotas futuras pendientes por adelantar.', overdue: 0, futuras, escenarios: [], settings }
  }

  // Escenarios por HORIZONTE (no por cantidad de cuotas): coherente con la regla.
  const escenarios: Escenario[] = []
  const push = (label: string, cs: Cuota[]) => {
    const calc = calcular(cs, settings, hoy)
    if (!calc || calc.months < Number(settings.min_months)) return
    if (escenarios.some(e => e.charges.length === cs.length)) return   // sin duplicados
    escenarios.push({ label, charges: cs.map(c => c.external_id), ...calc })
  }
  for (const m of [6, 12, 18, 24]) {
    const limite = new Date(hoy); limite.setMonth(limite.getMonth() + m)
    const lim = limite.toISOString().slice(0, 10)
    const cs = futuras.filter(c => c.due_date <= lim)
    if (cs.length && cs.length < futuras.length) push(`Adelantar ${m} meses`, cs)
  }
  push('Adelantar TODAS mis cuotas', futuras)

  return { elegible: true, motivo: null, overdue: 0, futuras, escenarios, settings }
}
