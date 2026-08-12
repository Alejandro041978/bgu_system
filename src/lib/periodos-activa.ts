// ---------------------------------------------------------------------------
// Equivalencia entre los periodos de SystemActiva y los semestres del ERP.
//
// Activa numeraba BLOQUES, no semestres: llega hasta el 13 en 2025, así que
// trece bloques caben en tres semestres. Y su año tampoco es nuestro año
// académico —"2024 · bloque 1" es SPRING 2024, del año académico 2023-2024—,
// de modo que ni el año ni el bloque se pueden traducir por su cuenta: hace
// falta el par completo.
//
// La tabla la dio Registros (2026-08-12). No se deduce ni se interpola: si
// mañana aparece un par que no está aquí, no se adivina — se pregunta. Un
// periodo inventado en un acta es una fecha falsa en un documento académico.
//
// Cubre las 28 combinaciones heredadas, 10.755 notas.
// ---------------------------------------------------------------------------

// `${term_year}|${term_block}` → nombre exacto del semestre en academic_semesters
export const PERIODO_ACTIVA_A_SEMESTRE: Record<string, string> = {
  '2023|1': 'AY 23-24 FALL 2023',

  '2024|1': 'AY 23-24 SPRING 2024',
  // El bloque 2 tuvo secciones (2-A, 2-B, 2-C): son grupos dentro del mismo
  // periodo, no periodos distintos.
  '2024|2': 'AY 23-24 SUMMER 2024',
  '2024|2-A': 'AY 23-24 SUMMER 2024',
  '2024|2-B': 'AY 23-24 SUMMER 2024',
  '2024|2-C': 'AY 23-24 SUMMER 2024',
  '2024|3': 'AY 24-25 FALL 2024',

  '2025|1': 'AY 24-25 SPRING 2025',
  '2025|2': 'AY 24-25 SPRING 2025',
  '2025|3': 'AY 24-25 SPRING 2025',
  '2025|4': 'AY 24-25 SPRING 2025',
  '2025|5': 'AY 24-25 SUMMER 2025',
  '2025|6': 'AY 24-25 SUMMER 2025',
  '2025|6-UA': 'AY 24-25 SUMMER 2025',
  '2025|7': 'AY 24-25 SUMMER 2025',
  '2025|8': 'AY 24-25 SUMMER 2025',
  '2025|9': 'AY 24-25 SUMMER 2025',
  '2025|10': 'AY 25-26 FALL 2025',
  '2025|11': 'AY 25-26 FALL 2025',
  '2025|12': 'AY 25-26 FALL 2025',
  '2025|13': 'AY 25-26 FALL 2025',

  '2026|1': 'AY 25-26 SPRING 2026',
  '2026|2': 'AY 25-26 SPRING 2026',
  '2026|3': 'AY 25-26 SPRING 2026',
  '2026|4': 'AY 25-26 SPRING 2026',
  '2026|5': 'AY 25-26 SUMMER 2026',
  '2026|6': 'AY 25-26 SUMMER 2026',
  '2026|7': 'AY 25-26 SUMMER 2026',
}

// El nombre del semestre de una nota, venga de donde venga.
//
//   · Moodle sella el bloque con el nombre del semestre ya normalizado
//     ("AY_25-26_FALL_2025"): solo hay que devolverle los espacios.
//   · SystemActiva trae año + bloque propios y pasa por la tabla.
//
// Devuelve null cuando no se sabe. Nunca aproxima.
export function semestreDePeriodo(
  termYear: number | null | undefined,
  termBlock: string | null | undefined,
): string | null {
  const b = String(termBlock ?? '').trim()
  if (!b) return null
  if (/^AY[_ ]/i.test(b)) return b.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (termYear == null) return null
  return PERIODO_ACTIVA_A_SEMESTRE[`${termYear}|${b}`] ?? null
}
