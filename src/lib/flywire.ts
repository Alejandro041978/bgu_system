import crypto from 'crypto'

// Verifica la firma de la notificación Flywire (header X-Flywire-Digest):
// base64( HMAC-SHA256( cuerpo_crudo, shared_secret ) ).
export function verifyFlywireSignature(rawBody: string, digestHeader: string | null): boolean {
  const secret = process.env.FLYWIRE_SHARED_SECRET
  if (!secret || !digestHeader) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(digestHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

// Estados de Flywire que consideramos "cobrado" (se refleja el pago en el estado de cuenta).
export const FLYWIRE_PAID_STATUSES = new Set(['processed', 'guaranteed', 'delivered'])
