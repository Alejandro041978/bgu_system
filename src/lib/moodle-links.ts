// ---------------------------------------------------------------------------
// Identidad del aula: qué asignatura del plan de estudios enseña.
//
// Hasta ahora la conexión vivía en semester_offerings.moodle_course_id, es
// decir el aula colgaba de la OFERTA FORMATIVA. Eso está mal por dos razones:
// el aula sobrevive a la oferta —se reutiliza entre cohortes año tras año, que
// es justo lo que produjo las notas fantasma— y una misma asignatura tiene
// legítimamente varias aulas (Inglés 2 tiene tres).
//
// La identidad cuelga del PLAN DE ESTUDIOS: un aula enseña una asignatura, y
// eso no cambia cuando cambia la cohorte. La oferta se queda con lo que sí
// sabe: qué cohorte se reúne dónde.
//
// Para PROPONER esa identidad no se adivina por nombre: los nombres de Moodle
// están en español ("Composición de Inglés II") y la malla en inglés
// ("English Composition II"). La señal fiable es el código de asignatura que
// encabeza el nombre del aula, más el programa, que va como sufijo.
//
// El sufijo (BSBA, BAA, MBA, DBA...) no es el código de programa del ERP
// (M004, DCEA-S25-...). Es una abreviatura humana. No se cablea a mano: se
// deduce de los datos — para cada sufijo, el programa cuya malla contiene más
// de los códigos de las aulas que lo llevan.
// ---------------------------------------------------------------------------

export interface AulaAudit {
  aula_id: number
  shortname: string | null
  matriculados: number | null
  categoria: string | null
}
export interface CursoMalla { id: string; program_id: string | null; name: string | null; code: string | null }

export const normCode = (s: string | null | undefined): string =>
  String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// "ENG 202 - Composición de Inglés II - UP BSBA" → { code: 'ENG202', sufijo: 'UP BSBA' }
export function leerNombreAula(shortname: string | null | undefined): { code: string | null; sufijo: string | null } {
  const s = String(shortname ?? '').trim()
  // \s* y no \s?: en el campus hay aulas escritas con dos espacios entre el
  // prefijo y el número ("CBU  200 - Cálculo Empresarial - BSBA"). Admitiendo
  // uno solo, ésas quedaban como "el nombre no empieza por un código" y no se
  // ofrecían como candidatas de su propia asignatura.
  const m = s.toUpperCase().match(/^\s*([A-Z]{2,5}\s*\d{2,4})/)
  const partes = s.split(' - ').map(x => x.trim()).filter(Boolean)
  return {
    code: m ? normCode(m[1]) : null,
    sufijo: partes.length > 1 ? partes[partes.length - 1] : null,
  }
}

// Sufijo → programa.
//
// La mejor fuente no es una inferencia: son las aulas que YA están vinculadas
// en el ERP. Cada una es una decisión que alguien tomó, y dice sin ambigüedad
// que ese sufijo pertenece a ese programa. Sólo cuando un sufijo no aparece en
// ninguna aula vinculada se recurre a la votación por códigos de malla.
export function inferirAlias(
  aulas: AulaAudit[], courses: CursoMalla[],
  vinculadas?: Map<number, string>,   // aula_id → course_id ya decidido
): Map<string, string> {
  const programaDeCurso = new Map<string, string | null>(courses.map(c => [c.id, c.program_id]))
  const codigosDe = new Map<string, Set<string>>()   // program_id → códigos de su malla
  for (const c of courses) {
    if (!c.program_id) continue
    if (!codigosDe.has(c.program_id)) codigosDe.set(c.program_id, new Set())
    codigosDe.get(c.program_id)!.add(normCode(c.code))
  }

  // 1. Lo que ya está decidido manda.
  const porDecision = new Map<string, Map<string, number>>()
  for (const a of aulas) {
    const cid = vinculadas?.get(Number(a.aula_id))
    if (!cid) continue
    const pid = programaDeCurso.get(cid)
    const { sufijo } = leerNombreAula(a.shortname)
    if (!pid || !sufijo) continue
    if (!porDecision.has(sufijo)) porDecision.set(sufijo, new Map())
    const v = porDecision.get(sufijo)!
    v.set(pid, (v.get(pid) ?? 0) + 1)
  }

  // 2. Y donde no hay decisión previa, se vota con los códigos de la malla.
  const votos = new Map<string, Map<string, number>>()
  for (const a of aulas) {
    const { code, sufijo } = leerNombreAula(a.shortname)
    if (!code || !sufijo) continue
    if (!votos.has(sufijo)) votos.set(sufijo, new Map())
    const v = votos.get(sufijo)!
    for (const [pid, cods] of codigosDe) {
      if (cods.has(code)) v.set(pid, (v.get(pid) ?? 0) + 1)
    }
  }

  const alias = new Map<string, string>()
  for (const [sufijo, v] of porDecision) {
    const orden = [...v.entries()].sort((a, b) => b[1] - a[1])
    // Un sufijo cuyas aulas vinculadas apuntan a dos programas distintos no es
    // una señal: es un sufijo que no identifica programa. No se usa.
    if (orden.length === 1 || (orden.length > 1 && orden[0][1] > orden[1][1])) alias.set(sufijo, orden[0][0])
  }
  for (const [sufijo, v] of votos) {
    if (alias.has(sufijo)) continue
    const orden = [...v.entries()].sort((a, b) => b[1] - a[1])
    // Sin decisión previa se exige un ganador claro: al menos dos aciertos y el
    // doble que el siguiente. Un empate no propone nada, que es mejor que
    // proponer mal.
    if (orden.length && orden[0][1] >= 2 && (orden.length === 1 || orden[0][1] >= orden[1][1] * 2)) {
      alias.set(sufijo, orden[0][0])
    }
  }
  return alias
}

export type Confianza = 'alta' | 'media' | 'ninguna'
// Familias del "no se puede proponer". No son lo mismo y no se arreglan igual:
//   no_es_asignatura   → aulas de inducción, demos, encuestas, capacitaciones.
//                        Se marcan no_curricular una vez y desaparecen.
//   codigo_desconocido → el aula trae un código que no está en ninguna malla.
//                        O falta cargar ese plan en el ERP (el doctorado
//                        entero, por ejemplo), o el código de Moodle está mal.
//   codigo_ambiguo     → el código existe en varios programas y el sufijo no
//                        alcanza para elegir. Se decide a mano, es rápido.
export type Familia = 'no_es_asignatura' | 'codigo_desconocido' | 'codigo_ambiguo' | null

export interface Propuesta {
  aula_id: number
  shortname: string | null
  matriculados: number
  code: string | null
  sufijo: string | null
  course_id: string | null
  course_name: string | null
  program_id: string | null
  confianza: Confianza
  familia: Familia
  motivo: string
  // El título del aula nombra a OTRA asignatura de la misma malla.
  //
  // La propuesta se decide por CÓDIGO, y así debe seguir: los nombres chocan
  // entre programas y media colección está en español contra una malla en
  // inglés. Pero cuando el título contradice al código, alguien tiene que
  // mirarlo antes de confirmar — el aula 155 se llamaba "COM 205 -
  // Interpersonal Communication", se vinculó por el COM 205 y pasó meses
  // archivando notas en una asignatura que sus 34 alumnos tenían convalidada.
  aviso_titulo?: { code: string | null; name: string | null } | null
}

// "Módulo 02 - Prescripción de Macronutrientes en el Deporte" → el nombre real.
// Los DCE no traen código: su aula se llama como la asignatura, precedida del
// número de módulo y a veces seguida del sufijo del programa.
export function nombreLimpio(shortname: string | null | undefined, sufijo: string | null): string {
  let s = String(shortname ?? '').trim()
  if (sufijo && s.endsWith(sufijo)) s = s.slice(0, s.length - sufijo.length).replace(/[\s\-–]+$/, '')
  s = s.replace(/^\s*(m[oó]dulo|module|modulo)\s*\d+\s*[-–.]?\s*/i, '')
  return s.trim()
}

export function proponer(
  aulas: AulaAudit[], courses: CursoMalla[], alias: Map<string, string>,
  claveNombre: (s: string | null | undefined) => string,
): Propuesta[] {
  const porProgCode = new Map<string, CursoMalla[]>()
  const porCode = new Map<string, CursoMalla[]>()
  const porNombre = new Map<string, CursoMalla[]>()
  for (const c of courses) {
    const k = normCode(c.code)
    if (k) {
      const pk = `${c.program_id}|${k}`
      if (!porProgCode.has(pk)) porProgCode.set(pk, [])
      porProgCode.get(pk)!.push(c)
      if (!porCode.has(k)) porCode.set(k, [])
      porCode.get(k)!.push(c)
    }
    const n = claveNombre(c.name)
    if (n) {
      if (!porNombre.has(n)) porNombre.set(n, [])
      porNombre.get(n)!.push(c)
    }
  }
  // El sufijo puede venir con prefijo de modalidad: "UP BSBA" es el upgrade del
  // mismo programa. Si el sufijo completo no se dedujo, se reintenta con su
  // última palabra, que es la sigla del programa.
  const programaDe = (sufijo: string | null): string | undefined => {
    if (!sufijo) return undefined
    const directo = alias.get(sufijo)
    if (directo) return directo
    const ultima = sufijo.trim().split(/\s+/).pop()
    return ultima && ultima !== sufijo ? alias.get(ultima) : undefined
  }

  // ¿El título del aula nombra a otra asignatura de la malla del programa que
  // propone el código? Se exige que la parte común sea la mayoría del nombre:
  // sin eso, "Marketing" saltaría con "Marketing Internacional", que es la
  // misma asignatura traducida y no un error.
  const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const otraDelTitulo = (shortname: string | null, elegido: CursoMalla): CursoMalla | null => {
    const partes = String(shortname ?? '').split(' - ').map(x => x.trim()).filter(Boolean)
    const titulo = norm(partes.length >= 2 ? partes[1] : '')
    if (!titulo || titulo.length < 6) return null
    const propio = norm(elegido.name)
    if (propio.includes(titulo) || titulo.includes(propio)) return null
    return courses.find(c => {
      if (c.id === elegido.id || c.program_id !== elegido.program_id) return false
      const n = norm(c.name)
      const corto = n.length < titulo.length ? n : titulo
      const largo = n.length < titulo.length ? titulo : n
      return largo.includes(corto) && corto.length / largo.length > 0.75
    }) ?? null
  }

  return aulas.map(a => {
    const { code, sufijo } = leerNombreAula(a.shortname)
    const base = {
      aula_id: Number(a.aula_id), shortname: a.shortname,
      matriculados: Number(a.matriculados ?? 0), code, sufijo,
    }
    const nada = { course_id: null, course_name: null, program_id: null, confianza: 'ninguna' as const }

    if (code) {
      const pid = programaDe(sufijo)
      if (pid) {
        const hit = porProgCode.get(`${pid}|${code}`) ?? []
        if (hit.length === 1) {
          return { ...base, course_id: hit[0].id, course_name: hit[0].name, program_id: hit[0].program_id, confianza: (otraDelTitulo(a.shortname, hit[0]) ? 'media' : 'alta') as Confianza, familia: null, motivo: `Código ${code} en el programa que corresponde a "${sufijo}"`, aviso_titulo: otraDelTitulo(a.shortname, hit[0]) }
        }
      }
      const global = porCode.get(code) ?? []
      if (global.length === 1) {
        return { ...base, course_id: global[0].id, course_name: global[0].name, program_id: global[0].program_id, confianza: 'media' as const, familia: null, motivo: `El código ${code} existe en un solo programa de toda la malla`, aviso_titulo: otraDelTitulo(a.shortname, global[0]) }
      }
      if (global.length > 1) {
        return { ...base, ...nada, familia: 'codigo_ambiguo' as const, motivo: `El código ${code} existe en ${global.length} asignaturas y el sufijo no permite elegir` }
      }
      return { ...base, ...nada, familia: 'codigo_desconocido' as const, motivo: `El código ${code} no existe en ninguna malla` }
    }

    // Sin código: los DCE nombran el aula como la asignatura, precedida del
    // número de módulo. Ahí el nombre sí es señal — es el mismo emparejador
    // que usan el acta y los egresados.
    const limpio = nombreLimpio(a.shortname, sufijo)
    const porN = porNombre.get(claveNombre(limpio)) ?? []
    if (porN.length === 1) {
      return { ...base, course_id: porN[0].id, course_name: porN[0].name, program_id: porN[0].program_id, confianza: 'media' as const, familia: null, motivo: `El nombre "${limpio}" corresponde a una única asignatura de la malla` }
    }
    if (porN.length > 1) {
      return { ...base, ...nada, familia: 'codigo_ambiguo' as const, motivo: `El nombre "${limpio}" existe en ${porN.length} programas y el aula no trae código` }
    }
    return { ...base, ...nada, familia: 'no_es_asignatura' as const, motivo: 'El aula no trae código y su nombre no corresponde a ninguna asignatura de la malla' }
  })
}
