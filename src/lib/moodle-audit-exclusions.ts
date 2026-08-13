// ---------------------------------------------------------------------------
// Qué categorías de Moodle no mira el Auditor del Campus.
//
// El auditor mide si las ponderaciones suman 100% y si la escala está sobre
// 100. Eso tiene sentido en un aula que enseña; en una en construcción, una en
// desuso o una demo, no mide nada. Y un incumplimiento que nadie va a arreglar
// enseña al equipo a no leer la lista.
//
// La coincidencia es por TRAMOS CONTIGUOS de la ruta, la misma regla que usa el
// filtro por familia del auditor. Así, declarar "Sin valor curricular" excluye
// todo lo que cuelgue de ella, y una ruta guardada antes de que la categoría se
// moviera de sitio sigue encontrando sus aulas dentro de la ruta nueva. Por
// tramos y no por `includes` para que un nombre no case a medias con otro:
// "Demo" no debe excluir "Demografía".
// ---------------------------------------------------------------------------

export interface Exclusion { ruta: string; nota: string | null }

/** ¿La ruta de categoría de un aula cae bajo alguna exclusión declarada? */
export function estaExcluida(ruta: string | null | undefined, exclusiones: Exclusion[]): boolean {
  if (!ruta || !exclusiones.length) return false
  const a = String(ruta).split(' / ').map(s => s.trim())
  return exclusiones.some(e => {
    const b = String(e.ruta).split(' / ').map(s => s.trim())
    if (!b.length || b.some(s => !s)) return false
    for (let i = 0; i + b.length <= a.length; i++) {
      if (b.every((seg, j) => a[i + j] === seg)) return true
    }
    return false
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cargarExclusiones(sb: any): Promise<Exclusion[]> {
  const { data, error } = await sb.from('moodle_audit_exclusions').select('ruta, nota')
  // Si la tabla todavía no existe (deploy antes que el SQL), no se excluye
  // nada: el auditor sigue mirándolo todo, que es como funcionaba ayer.
  if (error) return []
  return (data ?? []) as Exclusion[]
}
