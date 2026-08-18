import crypto from 'crypto'

// Verifica la firma de la notificación Flywire (header X-Flywire-Digest):
// base64( HMAC-SHA256( cuerpo_crudo, shared_secret ) ).
//
// Se prueban VARIAS claves y se devuelve cuál validó. Motivo: el 10/08/2026 las
// notificaciones de producción validaban y las de Demo no, con el mismo
// secreto configurado. Hay dos explicaciones posibles —Demo firma con otra
// clave, o los callbacks definidos por transacción no se firman igual— y
// discutirlas sin datos no lleva a ninguna parte. Guardando qué clave validó,
// la siguiente notificación lo dice sola.
const CLAVES = (): { nombre: string; valor: string }[] => [
  { nombre: 'principal', valor: process.env.FLYWIRE_SHARED_SECRET ?? '' },
  { nombre: 'demo', valor: process.env.FLYWIRE_SHARED_SECRET_DEMO ?? '' },
].filter(c => c.valor)

export function verifyFlywireSignature(
  rawBody: string, digestHeader: string | null,
): { valid: boolean; key: string | null } {
  if (!digestHeader) return { valid: false, key: null }
  for (const c of CLAVES()) {
    const esperado = crypto.createHmac('sha256', c.valor).update(rawBody, 'utf8').digest('base64')
    try {
      if (crypto.timingSafeEqual(Buffer.from(digestHeader), Buffer.from(esperado))) return { valid: true, key: c.nombre }
    } catch { /* longitudes distintas: no es esta clave */ }
  }
  return { valid: false, key: null }
}

// Estados de Flywire que consideramos "cobrado" (se refleja el pago en el estado de cuenta).
export const FLYWIRE_PAID_STATUSES = new Set(['processed', 'guaranteed', 'delivered'])

// ---------------------------------------------------------------------------
// Los importes de Flywire viajan en SUBUNIDADES: 40000 = 400.00 USD.
//
// Confirmado por Flywire (2026-08-10) tanto para el Payment Item del checkout
// como para amount_from / amount_to de la notificación. Registrar el valor tal
// como llega multiplicaba cada pago por cien.
//
// Y el factor no es 100 en todas las monedas: el peso chileno o el yen no
// tienen decimales —40000 CLP son 40.000 pesos, no 400— y el dinar kuwaití
// tiene tres. Dividir siempre entre cien habría inflado unas y hundido otras,
// que es peor que un error uniforme porque no se nota.
// ---------------------------------------------------------------------------
const SIN_DECIMALES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF',
  'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])
const TRES_DECIMALES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

export function decimalesDe(moneda: string | null | undefined): number {
  const m = String(moneda ?? '').trim().toUpperCase()
  if (SIN_DECIMALES.has(m)) return 0
  if (TRES_DECIMALES.has(m)) return 3
  return 2
}

/** Subunidades → importe real. 40000 USD → 400.00; 40000 CLP → 40000. */
export function desdeSubunidades(valor: number | null, moneda: string | null | undefined): number | null {
  if (valor == null || !isFinite(valor)) return null
  const d = decimalesDe(moneda)
  if (d === 0) return Math.round(valor)
  const f = 10 ** d
  return Math.round((valor / f) * f) / f
}

/** Importe real → subunidades, para armar el enlace de pago. 400 USD → 40000. */
export function aSubunidades(monto: number, moneda: string | null | undefined): number {
  return Math.round(monto * 10 ** decimalesDe(moneda))
}

// ---------------------------------------------------------------------------
// Los datos de un pago, venga como venga.
//
// Un evento de Flywire llega al ERP en DOS formas y no se parecen en nada:
//
//   · CSV del portal (importación manual) → plano y en unidades:
//     { first_name, last_name, dni, amount, method, finished_date }
//   · Notifications v2 (webhook) → anidado y en SUBUNIDADES:
//     { data: { amount_to: "30000", currency_to: "USD",
//               fields: { student_first_name, student_last_name, dni } } }
//
// La página de conciliación estaba escrita solo para la primera, así que a los
// pagos que entraban por webhook les mostraba "0.00" y "(sin nombre)" — con
// los datos completos guardados un nivel más abajo. Es el mismo error que ya
// nos costó 222 notificaciones sin registrar en agosto, repetido en la
// pantalla en vez de en el webhook.
//
// Vive aquí para que la próxima pantalla que lea eventos no vuelva a elegir
// una de las dos formas.
// ---------------------------------------------------------------------------
export interface DatosPago {
  nombre: string | null
  dni: string | null
  importe: number | null
  moneda: string | null
  metodo: string | null
  fecha: string | null
}

// El método de pago del CSV es un texto; en Notifications v2 es un OBJETO
// ({type:'card', brand:'visa', last_four_digits:'3362'…}). Devolverlo tal cual
// reventaba la pantalla con el error #31 de React —"un objeto no es un hijo
// válido"— y tumbaba la página entera de conciliación.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metodoLegible(pm: any): string | null {
  if (pm == null) return null
  if (typeof pm === 'string') return pm || null
  if (typeof pm !== 'object') return String(pm)
  const partes = [pm.brand ?? pm.type, pm.last_four_digits ? `····${pm.last_four_digits}` : null]
  return partes.filter(Boolean).join(' ') || null
}

// Una fecha que no es una fecha vale menos que ninguna.
//
// Las filas del CSV que llegaron con las columnas corridas dejaron cosas como
// finished_date:"online" en el crudo. Devolver eso como fecha hacía que
// registrar el pago desde la bandeja fallara contra Postgres —"invalid input
// syntax for type date"— sin que la pantalla explicara nada. Devolviendo null,
// quien llama usa su respaldo de siempre (la fecha del aviso) y el pago entra.
const fechaONada = (v: unknown): string | null => {
  const s = String(v ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function datosDePago(raw: any): DatosPago {
  const d = raw?.data ?? null
  if (d) {
    const f = d.fields ?? {}
    const nombre = [f.student_first_name, f.student_last_name].filter(Boolean).join(' ').trim()
    return {
      nombre: nombre || null,
      dni: f.dni || f.document_number || null,
      importe: desdeSubunidades(d.amount_to != null ? Number(d.amount_to) : null, d.currency_to),
      moneda: d.currency_to ?? null,
      metodo: metodoLegible(d.payment_method),
      fecha: fechaONada(d.finished_date),
    }
  }
  const nombre = [raw?.first_name, raw?.last_name].filter(Boolean).join(' ').trim()
  return {
    nombre: nombre || null,
    dni: raw?.dni || null,
    // El CSV trae el importe en unidades: no se convierte.
    importe: raw?.amount != null && raw.amount !== '' ? Number(raw.amount) : null,
    moneda: raw?.currency ?? null,
    metodo: metodoLegible(raw?.method),
    fecha: fechaONada(raw?.finished_date),
  }
}
