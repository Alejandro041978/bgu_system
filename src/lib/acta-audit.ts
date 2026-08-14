import { normalizarEvaluaciones } from '@/lib/evaluaciones'

// ---------------------------------------------------------------------------
// Auditor de Actas — contradicciones DENTRO del detalle de evaluaciones.
//
// El Auditor del Campus mira Moodle: que las ponderaciones de un aula sumen
// 100. Éste mira lo que llegó al expediente, que no es lo mismo: hay actas
// heredadas de SystemActiva que ningún aula respalda, y hay aulas que se
// reconfiguraron después de que sus notas ya estaban archivadas.
//
// Tres contrastes, todos por comparación consigo mismo. No hay tabla de
// patrones: no se compara contra "lo que debería ser" —eso cambia por familia y
// por año— sino contra lo que la propia asignatura hace en el resto de sus
// actas. Una minoría de una sola acta frente a trescientas iguales es una
// anomalía sin necesidad de que nadie declare el patrón.
//
// Informa, no corrige. Igual que el auditor de vínculos: el veredicto sobre una
// nota es de Académica, y un reporte que arregla solo lo que cree entender es
// la forma más rápida de romper un expediente.
// ---------------------------------------------------------------------------

export type TipoActa = 'descuadrada' | 'peso_incoherente' | 'conteo_variable'

export interface HallazgoActa {
  tipo: TipoActa
  asignatura: string
  programa: string
  evaluacion: string
  /** Lo que hace la mayoría de las actas de esa asignatura. */
  mayoria: string
  /** Lo que hace la minoría, que es lo que hay que mirar. */
  minoria: string
  actas: number
  detalle: string
}

/** El nombre de la evaluación sin su número ni su romano: "Quiz Session 07" y
 *  "Quiz Session 12" son el mismo tipo. Los romanos se pelan de IV/V hacia I
 *  para no morder palabras que terminan en I. */
export function tipoEvaluacion(desc: string | null | undefined): string {
  return String(desc ?? '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+(IV|V|III|II|I)$/i, '')
    .trim()
    .toLowerCase()
}

// El reparto 4.17/4.16 —o 3.33/3.34— es deliberado: mezcla 2:1 para que la suma
// dé exactamente 100. Marcarlo sería llenar el reporte de ruido y enseñar a
// ignorarlo.
const TOLERANCIA_PESO = 0.05

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function auditarActas(sb: any): Promise<{ revisadas: number; hallazgos: HallazgoActa[] }> {
  const cursos = await todo(sb, 'academic_courses', 'id, name, program_id')
  const programas = await todo(sb, 'academic_programs', 'id, name')
  const nomPrograma = new Map(programas.map(p => [String(p.id), String(p.name)]))
  const infoCurso = new Map(cursos.map(c => [String(c.id), {
    nombre: String(c.name), programa: nomPrograma.get(String(c.program_id)) ?? '—',
  }]))

  const notas = await todo(sb, 'academic_grades', 'external_id, course_id, student_name')
  const cursoDe = new Map<string, string>()
  const alumnoDe = new Map<string, string>()
  for (const n of notas) {
    if (n.course_id) cursoDe.set(String(n.external_id), String(n.course_id))
    if (n.student_name) alumnoDe.set(String(n.external_id), String(n.student_name))
  }

  const detalles = await todo(sb, 'academic_grade_details', 'external_id, course_name, grades, process_grades')

  // curso|tipo → peso → nº de ítems ; y curso|tipo → cantidad → nº de actas
  const pesos = new Map<string, Map<number, number>>()
  const conteos = new Map<string, Map<number, number>>()
  const descuadradas: { curso: string; alumno: string; total: number }[] = []
  let revisadas = 0

  for (const d of detalles) {
    const cid = cursoDe.get(String(d.external_id))
    if (!cid) continue                      // sin asignatura de la malla: no hay contra qué comparar
    const g = Array.isArray(d.grades) ? d.grades : []
    const p = Array.isArray(d.process_grades) ? d.process_grades : []
    const norm = normalizarEvaluaciones(g, p)
    const ev = norm.process_grades ?? []
    if (!ev.length) continue
    revisadas++

    if (norm.descuadrado) {
      descuadradas.push({
        curso: cid,
        alumno: alumnoDe.get(String(d.external_id)) ?? '—',
        total: Math.round(norm.total_pct * 100) / 100,
      })
    }

    const porTipo = new Map<string, number>()
    for (const e of ev) {
      const t = tipoEvaluacion(e.desc)
      if (!t) continue
      porTipo.set(t, (porTipo.get(t) ?? 0) + 1)
      const k = `${cid}|${t}`
      if (!pesos.has(k)) pesos.set(k, new Map())
      const pv = Math.round(Number(e.pct ?? 0) * 100) / 100
      pesos.get(k)!.set(pv, (pesos.get(k)!.get(pv) ?? 0) + 1)
    }
    for (const [t, c] of porTipo) {
      const k = `${cid}|${t}`
      if (!conteos.has(k)) conteos.set(k, new Map())
      conteos.get(k)!.set(c, (conteos.get(k)!.get(c) ?? 0) + 1)
    }
  }

  const hallazgos: HallazgoActa[] = []
  const mayorYmenor = (m: Map<number, number>) => {
    const orden = [...m].sort((a, b) => b[1] - a[1])
    return { top: orden[0], resto: orden.slice(1) }
  }

  for (const [k, m] of pesos) {
    const valores = [...m.keys()]
    if (Math.max(...valores) - Math.min(...valores) <= TOLERANCIA_PESO) continue
    const [cid, tipo] = k.split('|')
    const info = infoCurso.get(cid)
    if (!info) continue
    const { top, resto } = mayorYmenor(m)
    // Los que están dentro de la tolerancia respecto del mayoritario no son
    // desviación: son el reparto que hace cuadrar el 100.
    const fuera = resto.filter(([p]) => Math.abs(p - top[0]) > TOLERANCIA_PESO)
    if (!fuera.length) continue
    hallazgos.push({
      tipo: 'peso_incoherente',
      asignatura: info.nombre, programa: info.programa, evaluacion: tipo,
      mayoria: `${top[0]}% en ${top[1]} ítems`,
      minoria: fuera.map(([p, n]) => `${p}% en ${n}`).join(' · '),
      actas: fuera.reduce((s, [, n]) => s + n, 0),
      detalle: 'La misma evaluación pesa distinto en actas de la misma asignatura. Casi siempre son una o dos actas frente a cientos.',
    })
  }

  for (const [k, m] of conteos) {
    if (m.size < 2) continue
    const [cid, tipo] = k.split('|')
    const info = infoCurso.get(cid)
    if (!info) continue
    const { top, resto } = mayorYmenor(m)
    hallazgos.push({
      tipo: 'conteo_variable',
      asignatura: info.nombre, programa: info.programa, evaluacion: tipo,
      mayoria: `${top[0]} evaluaciones en ${top[1]} actas`,
      minoria: resto.map(([c, n]) => `${c} en ${n}`).join(' · '),
      actas: resto.reduce((s, [, n]) => s + n, 0),
      detalle: 'El número de evaluaciones de este tipo cambia entre actas de la misma asignatura. Puede ser un rediseño del curso —y entonces es historia— o una importación incompleta.',
    })
  }

  // Las descuadradas se agrupan por asignatura: una lista de 59 estudiantes no
  // se arregla estudiante por estudiante, se arregla en el aula.
  const porCurso = new Map<string, { alumnos: string[]; totales: Set<number> }>()
  for (const d of descuadradas) {
    if (!porCurso.has(d.curso)) porCurso.set(d.curso, { alumnos: [], totales: new Set() })
    porCurso.get(d.curso)!.alumnos.push(d.alumno)
    porCurso.get(d.curso)!.totales.add(d.total)
  }
  for (const [cid, v] of porCurso) {
    const info = infoCurso.get(cid)
    if (!info) continue
    hallazgos.push({
      tipo: 'descuadrada',
      asignatura: info.nombre, programa: info.programa, evaluacion: '—',
      mayoria: '100%',
      minoria: [...v.totales].sort((a, b) => a - b).map(t => `${t}%`).join(' · '),
      actas: v.alumnos.length,
      detalle: `Las ponderaciones no suman 100 después de normalizar. ${v.alumnos.slice(0, 3).join(', ')}${v.alumnos.length > 3 ? ` y ${v.alumnos.length - 3} más` : ''}.`,
    })
  }

  const orden: Record<TipoActa, number> = { descuadrada: 0, peso_incoherente: 1, conteo_variable: 2 }
  hallazgos.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.actas - a.actas)
  return { revisadas, hallazgos }
}
