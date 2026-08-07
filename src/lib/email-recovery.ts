import { createHash, randomInt } from 'crypto'

// Recuperación del correo institucional por autoservicio.
//
// Regla que sostiene todo lo demás: el estudiante NUNCA escribe a dónde se
// manda el código. Solo ve el destino enmascarado. Si pudiera elegirlo, el
// segundo factor no probaría nada — sería preguntarle al impostor dónde
// quiere recibir la llave.

/** Código de 6 dígitos. randomInt es criptográfico; Math.random no lo es. */
export function nuevoCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Se guarda el hash, nunca el código: una bitácora con códigos vivos es una llave maestra. */
export function hashCodigo(codigo: string, documento: string): string {
  return createHash('sha256').update(`${documento}:${codigo}`).digest('hex')
}

/** j••••z@g••••.com — reconocible por su dueño, inútil para quien no lo conoce. */
export function enmascararCorreo(correo: string): string {
  const [u, d] = String(correo).split('@')
  if (!u || !d) return '•••'
  const punta = (s: string, n: number) => s.slice(0, n) + '•'.repeat(Math.max(1, s.length - n))
  const partes = d.split('.')
  const dominio = punta(partes[0] ?? '', 1) + (partes.length > 1 ? '.' + partes.slice(1).join('.') : '')
  return `${punta(u, 1)}${u.length > 2 ? u.slice(-1) : ''}@${dominio}`
}

/** +51 ••• ••• 908 — los últimos tres bastan para reconocerlo. */
export function enmascararTelefono(tel: string): string {
  const d = String(tel).replace(/\D/g, '')
  if (d.length < 6) return '•••'
  return `+${d.slice(0, d.length - 9 > 0 ? d.length - 9 : 2)} ••• ••• ${d.slice(-3)}`
}

export const VIGENCIA_MINUTOS = 10
export const MAX_INTENTOS_CODIGO = 5

// Topes. Silenciosos a propósito: al que abusa no se le explica por qué dejó
// de funcionar, porque esa explicación es información.
export const TOPE_POR_DOCUMENTO = 3   // por hora
export const TOPE_POR_IP = 8          // por hora
export const ESPERA_ENTRE_RESETEOS_HORAS = 24

// Situaciones que pueden autoservirse. Un retiro permanente no: su buzón es el
// de más valor para un tercero y el de menos uso legítimo, así que pasa por una
// persona. La decisión se toma DESPUÉS de verificar el código, para poder
// explicárselo a quien ya demostró ser él.
export const SITUACIONES_AUTOSERVICIO = new Set(['activo', 'egresado'])

export type Desenlace =
  | 'reset'                 // se restableció y se enviaron las instrucciones
  | 'sin_correo'            // su programa no lleva correo institucional
  | 'cuenta_suspendida'     // existe pero está desactivada
  | 'cuenta_inexistente'    // debería tenerlo y no está creado
  | 'requiere_servicios'    // su situación exige atención humana
  | 'sin_canal'             // no hay dónde mandarle nada
