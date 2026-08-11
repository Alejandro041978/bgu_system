// ---------------------------------------------------------------------------
// Las asignaturas de un carrusel.
//
// Fuente única: academic_group_courses. Antes se deducían de las ofertas del
// semestre, y por eso el carrusel heredaba el año académico sin quererlo —
// repetía asignaturas una vez por semestre y se quedaba vacío cuando nadie
// creaba las ofertas del año nuevo.
//
// Vive aquí porque lo leen el motor de carruseles, el aprovisionamiento de
// Moodle, la ficha del grupo y los contadores. Cuatro lecturas distintas de
// "qué asignaturas tiene este carrusel" acabarían dando cuatro números.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface CursoDeGrupo { id: string; code: string | null; name: string | null; credits?: number | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, q: (from: number) => any): Promise<any[]> {
  const out: unknown[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await q(d)
    if (error) throw new Error(`academic_group_courses: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

// Mapa grupo → sus asignaturas. Sin groupIds, todos los carruseles.
export async function asignaturasDeGrupos(sb: SB, groupIds?: string[]): Promise<Map<string, CursoDeGrupo[]>> {
  const filas = await todo(sb, (from: number) => {
    let q = sb.from('academic_group_courses')
      .select('group_id, orden, course:academic_courses(id, code, name, credits)')
    if (groupIds) q = q.in('group_id', groupIds)
    return q.order('orden', { ascending: true, nullsFirst: false }).range(from, from + 999)
  })
  const out = new Map<string, CursoDeGrupo[]>()
  for (const f of filas) {
    if (!f.course) continue
    if (!out.has(f.group_id)) out.set(f.group_id, [])
    out.get(f.group_id)!.push(f.course)
  }
  // Orden estable dentro del grupo: por `orden` cuando lo tiene, y por código
  // cuando no — que es como se lee una malla.
  for (const lista of out.values()) {
    lista.sort((a, b) => String(a.code ?? '').localeCompare(String(b.code ?? '')))
  }
  return out
}

export async function asignaturasDeGrupo(sb: SB, groupId: string): Promise<CursoDeGrupo[]> {
  return (await asignaturasDeGrupos(sb, [groupId])).get(groupId) ?? []
}
