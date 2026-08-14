// ---------------------------------------------------------------------------
// Emparejamiento de una nota con una asignatura de la malla.
//
// El nombre es la ÚNICA llave viable: los códigos de academic_grades vienen de
// SystemActiva y son números de orden dentro de la malla (102, 104, 205...), no
// códigos de asignatura. No guardan relación con los nuestros (ACC 230, PMB 270)
// y además colisionan: en Contabilidad el número 205 corresponde a tres
// asignaturas distintas. Emparejar por número asignaría notas al azar.
//
// courseNameKey ignora acentos y puntuación porque la carga histórica trae
// variantes del mismo nombre ("Financial Decision-Making" vs "Financial Decision
// Making", "Competitive Advantage Theory and Application|" con una barra
// suelta). Verificado sobre los 65 programas: ninguna asignatura distinta del
// mismo programa colapsa con otra al normalizar así.
//
// Esta regla la comparten graduates.ts, document-requirements.ts, acta y
// retention-context.ts. Deben coincidir siempre: si divergen, Camila le dice al
// estudiante que le faltan 3 asignaturas mientras el acta le muestra 5.
// ---------------------------------------------------------------------------

const base = (s: string | null | undefined): string =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---------------------------------------------------------------------------
// Alias: nombres con los que una asignatura quedó grabada en academic_grades
// durante la importación histórica de SystemActiva.
//
// Es una lista CERRADA, no una regla: ya no se importa de SystemActiva, así que
// el conjunto de nombres defectuosos no crece. Cada entrada está verificada
// contra la malla del programa; no se infiere por parecido.
//
// Deliberadamente NO se emparejan nombres por prefijo ni por contención: dentro
// de un mismo programa conviven 'Principles of Accounting I' y 'Principles of
// Accounting II', 'English Composition I' y 'II', 'Dissertation Proposal and
// Research I/II/III'. Un match por prefijo daría por aprobada la segunda a quien
// sólo cursó la primera. Se comprobó: ocho pares colisionan así.
//
// Casos evaluados y DESCARTADOS a propósito:
//   'Qualitative Research II' -> 'Qualitative Research': mismo riesgo I/II y sus
//      19 filas no traen calificación, así que no rescataría a nadie.
//   'Business Leadership & Entrepreneurship' -> 'Business Leadership': el
//      sufijo sugiere otra asignatura, no una variante de escritura. Sigue
//      descartado: 12 filas, 7 con nota, y ningún estudiante tiene calificación
//      en las dos —así que podría ser un cambio de nombre—, pero eso lo dice
//      Registros y no el parecido de dos títulos.
//   'Assessment of the Individual and the Environment' -> 'Psychological First
//      Aid': no existe en ninguna malla y el nombre no se parece. Las 19 filas
//      quedaron desvinculadas a la espera de Registros.
// ---------------------------------------------------------------------------
const ALIASES = new Map<string, string>([
  ['quantitative and qualitative methods for decision', 'quantitative and qualitative methods for decision making'],
  ['business administration capstone project', 'business administration capstone'],
  ['development of artificial intelligence application', 'development of artificial intelligence applications'],
  // 'Eciency' perdió la ligadura ffi al importarse; es la misma palabra. La
  // asignatura existe en Renewable Energy and Sustainability Systems y se
  // dicta en el aula 591. (Esta entrada estuvo descartada mientras la malla
  // todavía no la tenía; hoy sí, y sus 15 filas se quedaban sin expediente.)
  ['energy eciency optimization', 'energy efficiency optimization'],
])

export const courseNameKey = (s: string | null | undefined): string => {
  const k = base(s)
  return ALIASES.get(k) ?? k
}

// ¿esta fila de nota corresponde a esta asignatura de la malla?
export function sameCourse(
  gradeName: string | null | undefined,
  courseName: string | null | undefined,
): boolean {
  const a = courseNameKey(gradeName)
  const b = courseNameKey(courseName)
  return a !== '' && a === b
}

// ---------------------------------------------------------------------------
// La misma pregunta, pero recibiendo las dos filas enteras. Existe para que el
// criterio se escriba UNA vez.
//
// Lo que dice arriba —el código no es llave— estaba escrito desde el primer día
// y aun así nueve lugares del ERP emparejaban `código O nombre`. El "O" bastaba:
// alcanza con que el número coincida para que una nota caiga en una asignatura
// que no es la suya. Se midió sobre las 25.298 filas: 121 emparejamientos
// vivían solo del código y los 121 eran falsos —"Psychological First Aid"
// ocupando "ABA Intervention", 33 de ellos con nota puesta—, y ninguno se
// perdía al quitarlo. Cero legítimos.
//
// El daño peor no era ése. Un estudiante con dos programas tiene dos mallas
// numeradas 101–105, así que TODAS sus notas coincidían con TODAS sus
// asignaturas: sus dos actas personales salían idénticas nota por nota, cada
// programa mostrando las calificaciones del otro.
//
// Por eso esta función no recibe el código ni por accidente.
//
// Lo que SÍ manda, cuando existe, es course_id: el vínculo resuelto en la
// importación. El nombre queda de reserva para las 166 filas que no lo tienen.
//
// Hace falta porque el nombre solo tampoco alcanza: se repite ENTRE programas.
// Nueve estudiantes llevan dos mallas con asignaturas homónimas —Administración
// y Contabilidad comparten dieciocho— y por nombre 192 filas se colaban de un
// programa al otro, 94 de ellas con nota. Un bachiller figuraba con la
// asignatura cubierta porque la había cursado en su maestría, que es justo lo
// que la institución no acepta sin convalidación de por medio.
//
// Preferir course_id exige que los vínculos estén sanos: se corrigieron los 20
// que apuntaban a otra asignatura antes de encender esta regla. Medido sobre el
// expediente completo, ninguna nota calificada desaparece al aplicarla.
// ---------------------------------------------------------------------------
export function filaDeCurso(
  fila: { course_name?: string | null; course_id?: string | null },
  curso: { id?: string | null; name?: string | null },
): boolean {
  if (fila.course_id && curso.id) return fila.course_id === curso.id
  return sameCourse(fila.course_name, curso.name)
}
