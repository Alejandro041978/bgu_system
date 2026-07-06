export interface Scale {
  origin_min: number
  origin_max: number
  origin_passing: number
}

/**
 * Convierte una nota de la escala de origen a nuestra escala 0–100, anclada a la
 * nota de aprobación de destino (que depende de la categoría del programa):
 *   - nota ≥ aprobación_origen → tramo [aprob_destino, 100]
 *   - nota < aprobación_origen → tramo [0, aprob_destino]
 * Devuelve null si faltan datos o el rango es inválido.
 */
export function convertGrade(grade: number, scale: Scale, destPassing: number): number | null {
  const { origin_min: oMin, origin_max: oMax, origin_passing: oPass } = scale
  if ([grade, oMin, oMax, oPass, destPassing].some(n => n == null || Number.isNaN(n))) return null
  if (oMax <= oMin || oPass <= oMin || oPass > oMax) return null

  let v: number
  if (grade >= oPass) {
    v = destPassing + ((grade - oPass) / (oMax - oPass)) * (100 - destPassing)
  } else {
    v = ((grade - oMin) / (oPass - oMin)) * destPassing
  }
  return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10
}
