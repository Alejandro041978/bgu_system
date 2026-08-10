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
