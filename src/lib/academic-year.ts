// ---------------------------------------------------------------------------
// Año académico como eje de los tres documentos maestros.
//
// Decisión del usuario (2026-08-03): Plan Estratégico, Plan de Efectividad e
// IAP corren todos de septiembre a agosto. El ERP ya tenía la tabla
// academic_years con sus semestres colgando; lo que faltaba era que los planes
// la usaran en vez de guardar un int suelto.
//
// Los planes viejos guardan `year = 2025` queriendo decir "el año académico
// que arranca en 2025", o sea 2025-2026. Mostrarlo como "2025" a secas hace
// que nadie sepa si el dato de julio de 2026 entra o no.
// ---------------------------------------------------------------------------

export interface AcademicYear {
  id: string
  name: string
  start_date: string
  end_date: string
  status: string
}

/** 2025 → "2025-2026". El int que guardan los planes es el año de ARRANQUE. */
export const etiquetaAnio = (startYear: number): string => `${startYear}-${startYear + 1}`

/** Año de arranque de un año académico, a partir de su fecha de inicio. */
export const anioDeInicio = (y: { start_date: string }): number =>
  Number(String(y.start_date).slice(0, 4))

/** "Academic Year 2025 - 2026" → "2025-2026". Cae al nombre si no hay fechas. */
export function etiquetaDe(y: Pick<AcademicYear, 'name' | 'start_date'>): string {
  const n = anioDeInicio(y)
  return Number.isFinite(n) && n > 1900 ? etiquetaAnio(n) : y.name
}

/** El año académico que contiene una fecha (por defecto, hoy). */
export function anioVigente<T extends { start_date: string; end_date: string }>(
  anios: T[], fecha = new Date(),
): T | null {
  const d = fecha.toISOString().slice(0, 10)
  return anios.find(y => y.start_date <= d && d <= y.end_date) ?? null
}

/**
 * Ventana real del año académico.
 *
 * OJO: hay años cuyo end_date cae ANTES del fin de su propio semestre de
 * verano (el AY 2025-2026 cierra el 26/07 pero su Summer termina el 23/08).
 * Si se usa end_date a secas, ese mes se pierde de todos los cálculos anuales
 * —retención, graduación, recaudación— sin que nadie lo note. Por eso la
 * ventana se estira hasta el último semestre cuando hace falta.
 */
export function ventana(
  anio: { start_date: string; end_date: string },
  semestres: { start_date: string; end_date: string }[] = [],
): { desde: string; hasta: string } {
  let hasta = anio.end_date
  for (const s of semestres) if (s.end_date > hasta) hasta = s.end_date
  return { desde: anio.start_date, hasta }
}
