// Bucket PRIVADO de los sílabos. Vive aquí y no en la ruta: un route.ts solo
// debe exportar sus handlers y su configuración, y exportar constantes desde
// él acopla dos rutas por un camino que Next no garantiza.
export const SYLLABI_BUCKET = 'syllabi'

// El sílabo VIGENTE de una asignatura es el de vigencia más reciente que YA
// empezó. Uno cargado para el semestre que viene existe y se ve —para eso se
// carga con antelación—, pero todavía no rige; si ninguno empezó, no hay
// vigente, y decirlo es más honesto que señalar como vigente uno que no lo es.
export function syllabusVigente<T extends { semester_start: string | null }>(
  lista: T[], hoy: string
): T | null {
  const empezados = lista.filter(s => s.semester_start && s.semester_start <= hoy)
  if (!empezados.length) return null
  return empezados.reduce((a, b) => (String(a.semester_start) >= String(b.semester_start) ? a : b))
}
