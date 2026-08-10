// ---------------------------------------------------------------------------
// El par que la convocatoria declara para un programa: colección + carrusel.
//
//   · el CARRUSEL dice qué asignaturas se cursan y en qué orden
//   · la COLECCIÓN dice en qué aula de cada asignatura entra el estudiante
//
// Vive aquí y no en la ruta de matrícula porque lo van a leer varios sitios
// —matricular, la colocación masiva, el reparo de matrículas viejas— y todos
// tienen que heredar exactamente lo mismo. Dos copias de esta lectura acabarían
// mandando a dos estudiantes de la misma convocatoria a colecciones distintas.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface ParConvocatoria {
  collection_id: string | null
  group_id: string | null
  // De dónde salió cada uno: sirve para decirlo en pantalla en vez de que el
  // valor aparezca preseleccionado sin explicación.
  origen: 'convocatoria' | 'sin_configurar'
}

export async function parDeConvocatoria(
  sb: SB, convocatoriaId: string | null | undefined, programId: string | null | undefined,
): Promise<ParConvocatoria> {
  const vacio: ParConvocatoria = { collection_id: null, group_id: null, origen: 'sin_configurar' }
  if (!convocatoriaId || !programId) return vacio
  const { data, error } = await sb.from('convocatoria_program_setup')
    .select('collection_id, group_id')
    .eq('convocatoria_id', convocatoriaId).eq('program_id', programId).maybeSingle()
  // Si la tabla todavía no existe (SQL sin correr), se comporta como "sin
  // configurar": la matrícula sigue funcionando como antes.
  if (error || !data) return vacio
  if (!data.collection_id && !data.group_id) return vacio
  return { collection_id: data.collection_id ?? null, group_id: data.group_id ?? null, origen: 'convocatoria' }
}

// Comprueba que lo que llega desde el cliente sea de ESE programa. El
// formulario ya solo ofrece lo del programa elegido, pero el que valida es el
// servidor: una colección de otra carrera mandaría al estudiante a aulas
// ajenas, y eso no se descubre hasta que alguien entra al campus.
export async function validarPar(
  sb: SB, programId: string, collectionId: string | null, groupId: string | null,
): Promise<string | null> {
  if (collectionId) {
    const { data } = await sb.from('moodle_collections').select('program_id').eq('id', collectionId).maybeSingle()
    if (!data) return 'La colección elegida no existe'
    if (data.program_id !== programId) return 'La colección elegida es de otro programa'
  }
  if (groupId) {
    const { data } = await sb.from('academic_groups').select('program_id').eq('id', groupId).maybeSingle()
    if (!data) return 'El carrusel elegido no existe'
    if (data.program_id !== programId) return 'El carrusel elegido es de otro programa'
  }
  return null
}
