// ---------------------------------------------------------------------------
// La meta del catálogo consolidado viene escrita como la escribió una persona:
// ">=59%", ">=20 países", "<=6 horas", "USD 3.6 M", ">=4/5", "≥80% competente
// por cada SLO". Para poder comparar un resultado con ella hay que sacar el
// número y la dirección.
//
// No se adivina. Lo que no se entienda se devuelve como no interpretable y se
// resuelve a mano: una meta mal leída convierte un indicador incumplido en
// cumplido sin que nadie lo note.
// ---------------------------------------------------------------------------

export interface MetaLeida {
  valor: number | null
  operador: '>=' | '<='
  /** Lo que se entendió, para poder mostrarlo al lado del texto original. */
  lectura: string
  ok: boolean
}

export function leerMeta(texto: string | null | undefined): MetaLeida {
  const t = String(texto ?? '').trim()
  if (!t) return { valor: null, operador: '>=', lectura: 'vacía', ok: false }

  // La dirección: "<=" y "≤" son las únicas que se cumplen bajando. El resto
  // —">=", "≥", o nada— se cumple subiendo.
  const menor = /(<=|≤|menor|máximo|maximo|no más|no mas)/i.test(t)
  const operador: '>=' | '<=' = menor ? '<=' : '>='

  // "4/5" es una nota sobre 5, no una división: vale 4.
  const sobre = t.match(/(\d+(?:[.,]\d+)?)\s*\/\s*5\b/)
  if (sobre) {
    const v = Number(sobre[1].replace(',', '.'))
    return { valor: v, operador, lectura: `${v} puntos (sobre 5)`, ok: true }
  }

  // "USD 3.6 M" / "3,6 M" → millones. La unidad del indicador ya es "USD
  // millones", así que el número se guarda tal cual: 3.6, no 3.600.000.
  const millones = t.match(/(\d+(?:[.,]\d+)?)\s*M\b/i)
  if (millones && /usd|\$|M\b/i.test(t)) {
    const v = Number(millones[1].replace(',', '.'))
    return { valor: v, operador, lectura: `${v} (en millones, como la unidad del indicador)`, ok: true }
  }

  // El primer número del texto, que es el que lleva la meta en todos los demás
  // casos: ">=59%", ">=20 países", "<=6 horas", "12", ">=5 nuevos por año".
  const n = t.match(/(-?\d+(?:[.,]\d+)?)/)
  if (!n) return { valor: null, operador, lectura: 'sin número reconocible', ok: false }
  const v = Number(n[1].replace(',', '.'))
  const pct = /%/.test(t)
  return { valor: v, operador, lectura: `${v}${pct ? '%' : ''}`, ok: true }
}
