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
  const m = s.toUpperCase().match(/^\s*([A-Z]{2,5}\s?\d{2,4})/)
  const partes = s.split(' - ').map(x => x.trim()).filter(Boolean)
  return {
    code: m ? normCode(m[1]) : null,
    sufijo: partes.length > 1 ? partes[partes.length - 1] : null,
  }
}

// Sufijo → programa, deducido de los datos.
export function inferirAlias(aulas: AulaAudit[], courses: CursoMalla[]): Map<string, string> {
  const codigosDe = new Map<string, Set<string>>()   // program_id → códigos de su malla
  for (const c of courses) {
    if (!c.program_id) continue
    if (!codigosDe.has(c.program_id)) codigosDe.set(c.program_id, new Set())
    codigosDe.get(c.program_id)!.add(normCode(c.code))
  }
  const votos = new Map<string, Map<string, number>>()  // sufijo → programa → aciertos
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
  for (const [sufijo, v] of votos) {
    const orden = [...v.entries()].sort((a, b) => b[1] - a[1])
    // Se exige que el ganador sea claro: al menos dos aciertos y el doble que
    // el siguiente. Un sufijo ambiguo no propone nada, que es mejor que
    // proponer mal.
    if (orden.length && orden[0][1] >= 2 && (orden.length === 1 || orden[0][1] >= orden[1][1] * 2)) {
      alias.set(sufijo, orden[0][0])
    }
  }
  return alias
}

export type Confianza = 'alta' | 'media' | 'ninguna'
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
  motivo: string
}

export function proponer(
  aulas: AulaAudit[], courses: CursoMalla[], alias: Map<string, string>,
): Propuesta[] {
  const porProgCode = new Map<string, CursoMalla[]>()
  const porCode = new Map<string, CursoMalla[]>()
  for (const c of courses) {
    const k = normCode(c.code)
    if (!k) continue
    const pk = `${c.program_id}|${k}`
    if (!porProgCode.has(pk)) porProgCode.set(pk, [])
    porProgCode.get(pk)!.push(c)
    if (!porCode.has(k)) porCode.set(k, [])
    porCode.get(k)!.push(c)
  }
  return aulas.map(a => {
    const { code, sufijo } = leerNombreAula(a.shortname)
    const base = {
      aula_id: Number(a.aula_id), shortname: a.shortname,
      matriculados: Number(a.matriculados ?? 0), code, sufijo,
    }
    if (!code) {
      return { ...base, course_id: null, course_name: null, program_id: null, confianza: 'ninguna' as const, motivo: 'El nombre del aula no empieza por un código de asignatura' }
    }
    const pid = sufijo ? alias.get(sufijo) : undefined
    if (pid) {
      const hit = porProgCode.get(`${pid}|${code}`) ?? []
      if (hit.length === 1) {
        return { ...base, course_id: hit[0].id, course_name: hit[0].name, program_id: hit[0].program_id, confianza: 'alta' as const, motivo: `Código ${code} en el programa que corresponde a "${sufijo}"` }
      }
    }
    const global = porCode.get(code) ?? []
    if (global.length === 1) {
      return { ...base, course_id: global[0].id, course_name: global[0].name, program_id: global[0].program_id, confianza: 'media' as const, motivo: `El código ${code} existe en un solo programa de toda la malla` }
    }
    if (global.length > 1) {
      return { ...base, course_id: null, course_name: null, program_id: null, confianza: 'ninguna' as const, motivo: `El código ${code} existe en ${global.length} asignaturas y el sufijo no permite elegir` }
    }
    return { ...base, course_id: null, course_name: null, program_id: null, confianza: 'ninguna' as const, motivo: `El código ${code} no existe en ninguna malla` }
  })
}
