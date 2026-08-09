// ---------------------------------------------------------------------------
// Free Degree — reglas del programa de referidos.
//
// Por cada referido que llega a PAGAR su Enrollment, el estudiante gana 100 USD
// contra su cargo de Degree (400 USD). Cuatro referidos inscritos y la
// titulacion le sale gratis.
//
// Aqui viven las tres decisiones del programa: quien puede referir, de quien es
// un referido que ya estaba en el CRM, y cuanto lleva ganado. La pantalla del
// estudiante y la hoja de control leen de aqui: si cada una lo resolviera por
// su cuenta, un dia dirian cifras distintas sobre el mismo bono.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export const CREDITO_POR_REFERIDO = 100
export const COSTO_DEGREE = 400
/** Concepto del cargo de matriculacion: pagarlo es lo que califica al referido. */
export const CONCEPTO_ENROLLMENT = 1
/** Concepto del derecho de titulacion, sobre el que se aplica el credito. */
export const CONCEPTO_DEGREE = 12

/** Solo Bachelor, Master y Doctorado tienen Degree que pagar. */
export const categoriaElegible = (nombre: string | null | undefined): boolean =>
  /bachelor|master|doctor/i.test(String(nombre ?? ''))

// ── Conflicto con el CRM ────────────────────────────────────────────────────
//
// Regla del usuario (2026-08-09): si el referido ya existe en el embudo pero
// lleva 3 meses sin contacto y no llego a "interesado", pasa al estudiante y se
// avisa al equipo de admision. En cualquier otro caso el lead es del equipo:
// hicieron ellos el trabajo y el referido no genera credito.
//
// Se decide por sistema, sin bandeja de arbitraje: una decision automatica que
// se puede explicar es mejor que una cola de casos que nadie mira.
export const MESES_SIN_CONTACTO = 3

const ORDEN: Record<string, number> = {
  descartado: -1, nuevo: 0, contactable: 1, calificado: 2, interesado: 3, inscrito: 4,
}

export interface LeadMin {
  id: string
  stage: string | null
  last_contact_at: string | null
  created_at: string | null
}

export function esDelEquipo(lead: LeadMin, ahora = new Date()): { delEquipo: boolean; motivo: string } {
  const etapa = ORDEN[String(lead.stage ?? 'nuevo')] ?? 0
  if (etapa >= ORDEN.interesado) {
    return { delEquipo: true, motivo: `el equipo ya lo tiene en etapa "${lead.stage}"` }
  }
  const corte = new Date(ahora)
  corte.setMonth(corte.getMonth() - MESES_SIN_CONTACTO)
  // Sin contacto registrado es todavia mas frio que un contacto viejo.
  const ultimo = lead.last_contact_at ? new Date(lead.last_contact_at) : null
  if (ultimo && ultimo > corte) {
    return { delEquipo: true, motivo: `el equipo lo contacto el ${String(lead.last_contact_at).slice(0, 10)}` }
  }
  return {
    delEquipo: false,
    motivo: ultimo
      ? `sin contacto desde el ${String(lead.last_contact_at).slice(0, 10)} y en etapa "${lead.stage ?? 'nuevo'}"`
      : `nunca fue contactado y sigue en etapa "${lead.stage ?? 'nuevo'}"`,
  }
}

// ── Estado visible del referido ─────────────────────────────────────────────
//
// Solo se guardan los estados que son una DECISION (registrado, del_equipo,
// duplicado). El avance comercial se lee del lead cada vez: guardarlo obligaria
// a sincronizarlo, y una copia que se desincroniza le miente al estudiante
// sobre su propio bono.
export type EstadoVisible =
  | 'registrado' | 'del_equipo' | 'duplicado'
  | 'contactado' | 'en_conversacion' | 'inscrito' | 'sin_interes'

export function estadoVisible(
  fila: { status: string; qualified_at: string | null },
  lead: { stage: string | null; last_contact_at: string | null } | null,
): EstadoVisible {
  if (fila.status === 'duplicado') return 'duplicado'
  if (fila.status === 'del_equipo') return 'del_equipo'
  if (fila.qualified_at) return 'inscrito'
  const etapa = String(lead?.stage ?? '')
  if (etapa === 'inscrito') return 'inscrito'
  if (etapa === 'descartado') return 'sin_interes'
  if (etapa === 'interesado' || etapa === 'calificado') return 'en_conversacion'
  if (lead?.last_contact_at || etapa === 'contactable') return 'contactado'
  return 'registrado'
}

export const ETIQUETA: Record<EstadoVisible, string> = {
  registrado: 'Registrado',
  del_equipo: 'Ya en proceso con Admisión',
  duplicado: 'Ya estaba referido',
  contactado: 'Contactado',
  en_conversacion: 'En conversación',
  inscrito: 'Inscrito',
  sin_interes: 'Sin interés',
}

// ── Crédito ─────────────────────────────────────────────────────────────────
//
// Ganado y aplicado se CALCULAN. El aplicado sale de los descuentos puestos
// sobre el cargo de Degree, que es donde el dinero se materializa de verdad.
export interface Credito {
  inscritos: number
  ganado: number
  aplicado: number
  disponible: number
  /** Lo que le falta para cubrir el Degree entero. */
  faltan_referidos: number
}

export async function creditoDe(sb: SB, studentId: string): Promise<Credito> {
  const { data: refs } = await sb.from('referrals')
    .select('qualified_at').eq('referrer_student_id', studentId).not('qualified_at', 'is', null)
  const inscritos = (refs ?? []).length
  const ganado = inscritos * CREDITO_POR_REFERIDO

  // Descuentos ya aplicados sobre sus cargos de Degree.
  const { data: cargos } = await sb.from('account_charges')
    .select('external_id').eq('student_id', studentId).eq('charge_type', CONCEPTO_DEGREE)
  const ids = (cargos ?? []).map((c: { external_id: string }) => c.external_id)
  let aplicado = 0
  if (ids.length) {
    const { data: pagos } = await sb.from('account_payments')
      .select('amount, series_code, transaction_reference').in('charge_external_id', ids)
    for (const p of pagos ?? []) {
      if (p.series_code === 'DESCUENTO' && /free degree/i.test(String(p.transaction_reference ?? ''))) {
        aplicado += Number(p.amount ?? 0)
      }
    }
  }
  const disponible = Math.max(0, Math.round((ganado - aplicado) * 100) / 100)
  return {
    inscritos, ganado, aplicado, disponible,
    faltan_referidos: Math.max(0, Math.ceil((COSTO_DEGREE - ganado) / CREDITO_POR_REFERIDO)),
  }
}
