// ---------------------------------------------------------------------------
// Lectura de CSV, con comillas y con validación.
//
// El parser anterior partía por comas respetando comillas, pero no entendía las
// comillas escapadas ("" dentro de un campo) y —sobre todo— nadie comprobaba
// que lo leído tuviera sentido antes de guardarlo.
//
// Eso dejó pasar filas con las columnas corridas: un evento de Flywire quedó
// con importe 72.313.558 —que era el DNI—, método "Peru", estado "online" y
// fecha "delivered". Ninguno de esos valores es posible en su campo, y aun así
// se guardó. El giro real era de $150.
//
// De ahí las dos reglas de aquí:
//
//   · El parser entiende comillas escapadas y saltos de línea dentro de campo.
//   · Cada fila se VALIDA contra la forma que debe tener, y la que no cumple se
//     rechaza con su motivo en vez de entrar callando. Una importación que
//     rechaza cien filas y lo dice es honesta; una que las mete mal parseadas
//     contamina la base y nadie se entera hasta que un total sale absurdo.
// ---------------------------------------------------------------------------

/** Divide un CSV en filas y campos. Entiende comillas, comillas escapadas ("")
 *  y saltos de línea dentro de un campo entrecomillado. */
export function parseCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false
  const t = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (enComillas) {
      if (c === '"') {
        // "" dentro de un campo entrecomillado es una comilla literal.
        if (t[i + 1] === '"') { campo += '"'; i++ }
        else enComillas = false
      } else campo += c
      continue
    }
    if (c === '"') { enComillas = true; continue }
    if (c === ',') { fila.push(campo); campo = ''; continue }
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue }
    campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas.filter(f => f.some(x => String(x).trim() !== ''))
}

/** Índices de columna por nombre de cabecera, tolerante a mayúsculas y espacios. */
export function indicesDeCabecera(cabecera: string[]): Map<string, number> {
  const m = new Map<string, number>()
  cabecera.forEach((h, i) => m.set(String(h).trim().toLowerCase(), i))
  return m
}

export interface FilaRechazada { linea: number; motivo: string; crudo: string }

/**
 * Por qué una fila trae más campos de los que dice la cabecera.
 *
 * Flywire exporta los nombres SIN entrecomillar, así que "Paredes cordova,
 * elizabeth" se parte en dos campos y corre todo lo que viene detrás: el
 * importe pasa a ser un apellido y la fecha, un estado. Antes se rechazaba
 * igual —bien— pero el motivo que salía era 'importe "elizabeth"', que
 * describe el síntoma y esconde la causa.
 *
 * No se intenta recomponer la fila: cuál de los cuatro campos de nombre llevaba
 * la coma es indecidible, y adivinarlo mal mete un importe equivocado en el
 * estado de cuenta de alguien. Se rechaza diciendo qué pasó.
 */
export function motivoDeDescuadre(fila: string[], cabecera: string[]): string | null {
  const sobran = fila.length - cabecera.length
  if (sobran <= 0) return null
  return `la fila trae ${fila.length} campos y la cabecera ${cabecera.length}: `
    + `${sobran} coma${sobran > 1 ? 's' : ''} de más, casi siempre un nombre sin comillas`
}

// ── Validadores elementales ────────────────────────────────────────────────
export const esFecha = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(String(v ?? '').trim())

export const esImporte = (v: string): boolean => {
  const s = String(v ?? '').trim().replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return false
  return isFinite(Number(s))
}

/** Un identificador de giro de Flywire: ZBL + dígitos. */
export const esReferencia = (v: string): boolean => /^[A-Z]{2,4}\d{6,}$/.test(String(v ?? '').trim())

// Los estados que Flywire usa. Cualquier otro valor en esa columna significa
// que la fila viene corrida, no que exista un estado nuevo: si aparece uno de
// verdad, se añade aquí a propósito y no por accidente.
export const ESTADOS_FLYWIRE = new Set([
  'initiated', 'guaranteed', 'processed', 'delivered', 'cancelled', 'canceled',
  'reversed', 'refunded', 'pending', 'received', 'unpaid',
])
