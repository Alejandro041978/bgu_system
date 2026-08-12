// ---------------------------------------------------------------------------
// Auditor de vínculos de aula.
//
// El aula 155 estuvo meses vinculada a la asignatura equivocada y archivó 34
// notas en una asignatura que además estaba convalidada. Nadie lo vio porque
// la vinculación es POR CÓDIGO —y el código del nombre del aula era erróneo—,
// así que el único testigo posible, el título del aula, era justo la pieza que
// dejamos de leer a propósito.
//
// La lección no es volver a emparejar por nombre: los nombres chocan entre
// programas y media colección está en español contra una malla en inglés. La
// lección es contrastar lo que ya tenemos y enseñar las contradicciones.
//
// Cuatro contrastes, los cuatro baratos:
//
//   1. TÍTULO vs CÓDIGO — el título del aula nombra a otra asignatura de la
//      misma malla. Así se encontró la 155.
//   2. COLECCIÓN vs OFERTA — las dos fuentes de identidad no dicen lo mismo.
//      Así aparecieron las tres de Psicología, con la colección corrida una
//      posición. Y en los cuatro casos la oferta tenía razón: por eso no se
//      retira, se contrasta.
//   3. CONVALIDADA CON NOTAS — una asignatura convalidada que recibe
//      calificaciones. Es la consecuencia visible de un vínculo equivocado, y
//      se descubría comparando dos pantallas a mano.
//   4. NOTA SIN FICHA — el documento de la nota no cruza con ningún
//      estudiante. Los cuatro casos del 12-08 venían mal escritos desde
//      SystemActiva: un punto suelto, un documento sin guiones, una CURP
//      cortada. 91 notas de gente real, una con 10 asignaturas calificadas.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

const norm = (s: string | null | undefined): string =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// El título del aula: lo que va entre el código y el sufijo del programa.
// "COM 205 - Interpersonal Communication - UP BAA" → "Interpersonal Communication"
export function tituloDeAula(shortname: string | null | undefined): string {
  const partes = String(shortname ?? '').split(' - ').map(x => x.trim()).filter(Boolean)
  return partes.length >= 2 ? partes[1] : ''
}

export interface Hallazgo {
  tipo: 'titulo' | 'fuentes' | 'convalidada' | 'sin_ficha'
  aula_id?: number
  aula?: string | null
  coleccion?: string | null
  dice: string
  contra: string
  notas: number
  detalle: string
}

async function todo(sb: SB, tabla: string, cols: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(d, d + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

export async function auditarVinculos(sb: SB): Promise<{ hallazgos: Hallazgo[]; revisadas: number }> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [links, aulas, cursos, cols, offs, grades, tcs, items, studs] = await Promise.all([
    todo(sb, 'moodle_course_links', 'aula_id, course_id, collection_id, kind, replaced_at') as Promise<any[]>,
    todo(sb, 'moodle_aula_audit', 'aula_id, shortname') as Promise<any[]>,
    todo(sb, 'academic_courses', 'id, code, name, program_id') as Promise<any[]>,
    todo(sb, 'moodle_collections', 'id, name') as Promise<any[]>,
    todo(sb, 'semester_offerings', 'moodle_course_id, course_id') as Promise<any[]>,
    todo(sb, 'academic_grades', 'document_number, student_name, course_name, source, final_grade, moodle_course_id') as Promise<any[]>,
    todo(sb, 'transfer_credits', 'id, student_id, status') as Promise<any[]>,
    todo(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id, dest_course_name') as Promise<any[]>,
    todo(sb, 'academic_students', 'id, document_number, first_name, last_name') as Promise<any[]>,
  ])
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const cursoDe = new Map(cursos.map(c => [c.id, c]))
  const nombreAula = new Map(aulas.map(a => [Number(a.aula_id), String(a.shortname ?? '')]))
  const colN = new Map(cols.map(c => [c.id, c.name]))
  const porPrograma = new Map<string, typeof cursos>()
  for (const c of cursos) {
    if (!porPrograma.has(c.program_id)) porPrograma.set(c.program_id, [])
    porPrograma.get(c.program_id)!.push(c)
  }
  const notasDe = new Map<string, number>()
  for (const g of grades) {
    if (!g.moodle_course_id) continue
    const k = String(g.moodle_course_id)
    notasDe.set(k, (notasDe.get(k) ?? 0) + 1)
  }
  const porOferta = new Map<number, Set<string>>()
  for (const o of offs) {
    if (!o.moodle_course_id || !o.course_id) continue
    const k = Number(o.moodle_course_id)
    if (!porOferta.has(k)) porOferta.set(k, new Set())
    porOferta.get(k)!.add(String(o.course_id))
  }

  const hallazgos: Hallazgo[] = []
  const vivos = links.filter(l => l.kind === 'asignatura' && !l.replaced_at && l.course_id)

  for (const l of vivos) {
    const cu = cursoDe.get(l.course_id)
    if (!cu) continue
    const sn = nombreAula.get(Number(l.aula_id))
    const base = {
      aula_id: Number(l.aula_id), aula: sn ?? null,
      coleccion: l.collection_id ? (colN.get(l.collection_id) ?? null) : null,
      notas: notasDe.get(String(l.aula_id)) ?? 0,
    }

    // 1. El título nombra a OTRA asignatura de la misma malla.
    const titulo = norm(tituloDeAula(sn))
    if (titulo && titulo.length >= 6) {
      const propio = norm(cu.name)
      const pareceOtra = !(propio.includes(titulo) || titulo.includes(propio))
        ? (porPrograma.get(cu.program_id) ?? []).find(x => {
          if (x.id === cu.id) return false
          const n = norm(x.name)
          // Coincidencia por contención en los dos sentidos, pero exigiendo que
          // la parte común sea la mayoría del nombre: sin eso, "Marketing"
          // dispara con "Marketing Internacional", que es la misma asignatura
          // traducida y no un error.
          const corto = n.length < titulo.length ? n : titulo
          const largo = n.length < titulo.length ? titulo : n
          return largo.includes(corto) && corto.length / largo.length > 0.75
        })
        : null
      if (pareceOtra) {
        hallazgos.push({
          ...base, tipo: 'titulo',
          dice: `${cu.code} · ${cu.name}`,
          contra: `${pareceOtra.code} · ${pareceOtra.name}`,
          detalle: 'El código del nombre del aula apunta a una asignatura y su título nombra a otra de la misma malla.',
        })
      }
    }

    // 2. La colección y la oferta no dicen lo mismo.
    const deOferta = porOferta.get(Number(l.aula_id))
    if (deOferta?.size && !deOferta.has(String(l.course_id))) {
      const otras = [...deOferta].map(id => cursoDe.get(id)).filter(Boolean)
      hallazgos.push({
        ...base, tipo: 'fuentes',
        dice: `${cu.code} · ${cu.name}`,
        contra: otras.map(o => `${o.code} · ${o.name}`).join(' / '),
        detalle: 'La colección y la oferta apuntan a asignaturas distintas. En los cuatro casos vistos hasta hoy, la oferta tenía razón.',
      })
    }
  }

  // 3. Asignaturas convalidadas que están recibiendo notas.
  const docDe = new Map(studs.map(s => [s.id, String(s.document_number ?? '')]))
  const nomDe = new Map(studs.map(s => [String(s.document_number ?? ''), [s.first_name, s.last_name].filter(Boolean).join(' ')]))
  const itemsDe = new Map<string, typeof items>()
  for (const i of items) {
    if (!itemsDe.has(i.transfer_credit_id)) itemsDe.set(i.transfer_credit_id, [])
    itemsDe.get(i.transfer_credit_id)!.push(i)
  }
  const convalidadas = new Map<string, Set<string>>()   // documento → nombres normalizados
  for (const t of tcs) {
    if (t.status !== 'active') continue
    const doc = docDe.get(t.student_id)
    if (!doc) continue
    if (!convalidadas.has(doc)) convalidadas.set(doc, new Set())
    for (const i of itemsDe.get(t.id) ?? []) {
      const nombre = cursoDe.get(i.dest_course_id)?.name ?? i.dest_course_name
      convalidadas.get(doc)!.add(norm(nombre))
    }
  }
  const choques = new Map<string, { curso: string; docs: Set<string>; aulas: Set<string> }>()
  for (const g of grades) {
    if (!g.course_name || ['plan', 'convalidacion', 'validacion'].includes(String(g.source))) continue
    const doc = String(g.document_number ?? '')
    if (!convalidadas.get(doc)?.has(norm(g.course_name))) continue
    const k = String(g.course_name)
    if (!choques.has(k)) choques.set(k, { curso: k, docs: new Set(), aulas: new Set() })
    choques.get(k)!.docs.add(doc)
    if (g.moodle_course_id) choques.get(k)!.aulas.add(String(g.moodle_course_id))
  }
  for (const c of choques.values()) {
    hallazgos.push({
      tipo: 'convalidada', notas: c.docs.size,
      aula: c.aulas.size ? `aula(s) ${[...c.aulas].join(', ')}` : null,
      dice: c.curso, contra: 'convalidada para esos estudiantes',
      detalle: `${c.docs.size} estudiante(s) con esta asignatura convalidada están recibiendo notas: `
        + [...c.docs].slice(0, 6).map(d => nomDe.get(d) ?? d).join(', ') + (c.docs.size > 6 ? '…' : ''),
    })
  }

  // 4. Notas cuyo documento no cruza con NINGUNA ficha.
  //
  // Los cuatro casos encontrados el 12-08-2026 venían mal escritos desde
  // SystemActiva: un punto suelto delante, un punto detrás, un documento
  // dominicano sin sus guiones y una CURP cortada a 14 de sus 18 caracteres.
  // Eran 91 notas de gente real —una estudiante con 10 asignaturas
  // calificadas— y la única señal era que salieran como "(sin ficha)" en un
  // reporte que alguien mirara por casualidad.
  //
  // Se agrupan por documento porque el arreglo es por documento, no por nota.
  const fichas = new Set(studs.map(s => String(s.document_number ?? '')).filter(Boolean))
  const digitos = new Map<string, string>()
  for (const s of studs) {
    const d = String(s.document_number ?? '').replace(/\D/g, '')
    if (d) digitos.set(d, `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim())
  }
  const sinFicha = new Map<string, { n: number; nombre: string | null; conNota: number }>()
  for (const g of grades) {
    const d = String(g.document_number ?? '')
    if (!d || fichas.has(d)) continue
    if (!sinFicha.has(d)) sinFicha.set(d, { n: 0, nombre: null, conNota: 0 })
    const v = sinFicha.get(d)!
    v.n++
    if (g.student_name && !v.nombre) v.nombre = String(g.student_name)
    if (g.final_grade != null) v.conNota++
  }
  for (const [doc, v] of sinFicha) {
    // Si los mismos dígitos sí encuentran ficha, el arreglo es evidente y se
    // dice; si no, hace falta que alguien identifique a la persona.
    const porDig = digitos.get(doc.replace(/\D/g, ''))
    hallazgos.push({
      tipo: 'sin_ficha', notas: v.n,
      dice: doc, contra: v.nombre ?? '(la nota no trae nombre)',
      detalle: `${v.n} nota(s), ${v.conNota} con calificación.`
        + (porDig ? ` Los mismos dígitos corresponden a la ficha de ${porDig}.` : ' Ninguna ficha coincide, ni comparando solo los dígitos.'),
    })
  }

  hallazgos.sort((a, b) => b.notas - a.notas)
  return { hallazgos, revisadas: vivos.length }
}
