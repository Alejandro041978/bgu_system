// ---------------------------------------------------------------------------
// CASHPAY — motor del beneficio por adelantar cuotas.
//
// Regla del usuario (2026-07-29): el descuento paga TIEMPO ANTICIPADO, no
// número de cuotas. Se toma la cuota MÁS LEJANA del tramo que se adelanta, se
// miden los meses exactos hasta su vencimiento y ese porcentaje (meses × tasa,
// con tope) se aplica a la SUMA de las cuotas adelantadas.
//
// Por qué importa: con planes semanales, contar cuotas daría un descuento
// enorme por poco tiempo real de anticipación. Con esta regla, un plan semanal
// y uno mensual que cubren el mismo horizonte reciben lo mismo.
//
// Regla del usuario (2026-08-03): NO hay escenarios a elegir. El beneficio es
// uno solo — se adelantan TODAS las cuotas de pensión pendientes — y alcanza
// únicamente a pensión: trámites, exámenes y documentos quedan fuera, ni para
// sumar al beneficio ni para bloquearlo.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/** Pensión. Es el único concepto que entra al beneficio. */
export const CHARGE_TYPE_TUITION = 2

export interface CashpaySettings {
  id: string; monthly_rate: number; max_discount: number
  min_months: number; quote_valid_days: number
}
export interface Cuota { external_id: string; amount: number; balance: number; due_date: string; concepto: string | null }
export interface Oferta {
  charges: string[]; cuotas: number
  months: number; discount_pct: number
  gross: number; discount: number; net: number
  hasta: string   // vencimiento de la cuota más lejana
}
export interface Simulation {
  elegible: boolean
  motivo: string | null
  overdue: number
  futuras: Cuota[]
  oferta: Oferta | null
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

/** Descuento del bloque: meses hasta la cuota más lejana × tasa, con tope. */
export function calcular(cuotas: Cuota[], s: CashpaySettings, hoy = new Date()): Oferta | null {
  if (!cuotas.length) return null
  const lejana = cuotas.reduce((a, b) => (a.due_date > b.due_date ? a : b))
  const months = mesesEntre(hoy, new Date(lejana.due_date + 'T00:00:00'))
  const pct = Math.min(Number(s.max_discount), r2(months * Number(s.monthly_rate)))
  const gross = r2(cuotas.reduce((t, c) => t + c.balance, 0))
  const discount = r2(gross * pct / 100)
  return {
    charges: cuotas.map(c => c.external_id), cuotas: cuotas.length,
    months, discount_pct: pct, gross, discount, net: r2(gross - discount), hasta: lejana.due_date,
  }
}

/**
 * Simula el beneficio con LAS cuotas de pensión reales del estudiante.
 * Elegible solo si no tiene pensión vencida: el beneficio adelanta futuro,
 * no perdona atrasos.
 */
export async function simulate(sb: SB, studentId: string): Promise<Simulation> {
  const settings = await getSettings(sb)
  const hoy = new Date()
  const hoyISO = hoy.toISOString().slice(0, 10)

  const { data: charges } = await sb.from('account_charges')
    .select('external_id, amount, due_date, charge_type').eq('student_id', studentId)
    .eq('charge_type', CHARGE_TYPE_TUITION)
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

  const no = (motivo: string, over = 0): Simulation =>
    ({ elegible: false, motivo, overdue: r2(over), futuras, oferta: null, settings })

  if (overdue > 0.005) {
    return no('Tienes cuotas de pensión vencidas. Regularízalas y luego podrás adelantar las que vienen con descuento.', overdue)
  }
  if (!futuras.length) return no('No tienes cuotas de pensión pendientes por adelantar.')

  // Una sola oferta: todas las cuotas de pensión que le quedan.
  const oferta = calcular(futuras, settings, hoy)
  if (!oferta) return no('No se pudo calcular el beneficio.')
  if (oferta.months < Number(settings.min_months)) {
    return no('Tus cuotas están demasiado próximas a vencer para acceder al beneficio.')
  }

  return { elegible: true, motivo: null, overdue: 0, futuras, oferta, settings }
}
