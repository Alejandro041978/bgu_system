// ---------------------------------------------------------------------------
// Backfill de la colección de aulas en las matrículas que no la tienen.
//
// La colección decide en cuál de las aulas de cada asignatura entra el
// estudiante (la regular, la del upgrade, la del campus socio, la que se dicta
// en inglés). Fue un campo suelto del formulario hasta el 10-08-2026: 23 de
// 1.104 matrículas de activos lo tenían puesto. Las 1.081 restantes se
// aprovisionan por el respaldo de julio —el aula pegada a la oferta—, que tiene
// sitio para UNA aula por asignatura: el del campus socio y el de la colección
// regular aterrizan en la misma.
//
// Esto NO adivina. Cada propuesta lleva el criterio que la sostiene, y lo que
// no se puede sostener queda pendiente de una decisión humana en vez de
// rellenarse con la opción más probable. Una colección mal puesta manda al
// estudiante a un aula ajena, y eso no se descubre hasta que entra al campus.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

// Un upgrade convalida la mitad del programa. El corte no es un número
// elegido a ojo: de las 156 matrículas ambiguas, las 98 que tienen
// convalidación activa convalidan TODAS 20 asignaturas o más, y ninguna cae
// entre 1 y 19. La frontera está vacía, así que el criterio separa limpio.
export const UMBRAL_UPGRADE = 20

export type Criterio = 'moodle' | 'convocatoria' | 'upgrade' | 'unica' | 'externo' | 'pendiente'

export const ETIQUETA_CRITERIO: Record<Criterio, string> = {
  moodle: 'Por las aulas donde ya tiene notas',
  convocatoria: 'Por la colección que declara su convocatoria',
  upgrade: `Por su convalidación de ${UMBRAL_UPGRADE}+ asignaturas (upgrade)`,
  unica: 'Porque su programa tiene una sola colección',
  externo: 'Campus externo: no le corresponde colección',
  pendiente: 'Sin evidencia: necesita decisión',
}

export interface Propuesta {
  enrollment_id: string
  student_id: string
  estudiante: string
  documento: string | null
  program_id: string
  programa: string
  convocatoria_id: string | null
  convocatoria: string
  criterio: Criterio
  collection_id: string | null
  coleccion: string | null
  // Para las pendientes: entre qué colecciones hay que elegir.
  opciones: { id: string; name: string }[]
  detalle: string
}

export interface Simulacro {
  total: number
  por_criterio: { criterio: Criterio; etiqueta: string; matriculas: number }[]
  propuestas: Propuesta[]
  // Las pendientes agrupadas por (programa × convocatoria): quien decide lo
  // hace por bloque, que es como se decidió en su día en la vida real.
  bloques: {
    program_id: string; programa: string
    convocatoria_id: string | null; convocatoria: string
    matriculas: number
    opciones: { id: string; name: string }[]
    estudiantes: string[]
  }[]
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

export async function simularBackfill(sb: SB): Promise<Simulacro> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [enrs, studs, progs, cols, links, grades, tcs, items, convs, setup] = await Promise.all([
    todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, collection_id, convocatoria_id') as Promise<any[]>,
    todo(sb, 'academic_students', 'id, document_number, first_name, last_name, second_last_name, situation') as Promise<any[]>,
    todo(sb, 'academic_programs', 'id, name, partner_campus') as Promise<any[]>,
    todo(sb, 'moodle_collections', 'id, program_id, name, active') as Promise<any[]>,
    todo(sb, 'moodle_course_links', 'aula_id, collection_id') as Promise<any[]>,
    todo(sb, 'academic_grades', 'student_id, document_number, moodle_course_id') as Promise<any[]>,
    todo(sb, 'transfer_credits', 'id, student_id, dest_program_id, status') as Promise<any[]>,
    todo(sb, 'transfer_credit_items', 'transfer_credit_id') as Promise<any[]>,
    todo(sb, 'convocatorias', 'id, name') as Promise<any[]>,
    // Puede no existir todavía (SQL sin correr): se trata como vacío.
    sb.from('convocatoria_program_setup').select('convocatoria_id, program_id, collection_id')
      .then((r: any) => (r.error ? [] : (r.data ?? [])), () => []) as Promise<any[]>,
  ])
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const activo = new Set(studs.filter(s => (s.situation ?? 'activo') === 'activo').map(s => s.id))
  const est = new Map(studs.map(s => [s.id, s]))
  const prog = new Map(progs.map(p => [p.id, p]))
  const convN = new Map(convs.map(c => [c.id, c.name]))

  const colDe = new Map<string, { id: string; name: string }[]>()
  for (const c of cols) {
    if (!c.active) continue
    if (!colDe.has(c.program_id)) colDe.set(c.program_id, [])
    colDe.get(c.program_id)!.push({ id: c.id, name: c.name })
  }
  const nombreCol = new Map(cols.map(c => [c.id, c.name]))

  const colDeAula = new Map<string, string>()
  for (const l of links) if (l.collection_id) colDeAula.set(String(l.aula_id), String(l.collection_id))

  // Aulas por estudiante, con llave uuid (fase 2 documento→uuid); el documento
  // queda de respaldo para filas sin él.
  const aulasDe = new Map<string, string[]>()
  for (const g of grades) {
    if (!g.moodle_course_id) continue
    const k = g.student_id ? String(g.student_id) : `doc:${g.document_number ?? ''}`
    if (!aulasDe.has(k)) aulasDe.set(k, [])
    aulasDe.get(k)!.push(String(g.moodle_course_id))
  }

  const nItems = new Map<string, number>()
  for (const i of items) nItems.set(String(i.transfer_credit_id), (nItems.get(String(i.transfer_credit_id)) ?? 0) + 1)
  const convalida = new Map<string, number>()
  for (const t of tcs) {
    if (t.status !== 'active') continue
    const k = `${t.student_id}|${t.dest_program_id}`
    convalida.set(k, (convalida.get(k) ?? 0) + (nItems.get(String(t.id)) ?? 0))
  }

  const parDeConv = new Map<string, string>()
  for (const s of setup) if (s.collection_id) parDeConv.set(`${s.convocatoria_id}|${s.program_id}`, String(s.collection_id))

  const propuestas: Propuesta[] = []
  for (const e of enrs) {
    if (e.collection_id) continue
    if (!activo.has(e.student_id)) continue
    const p = prog.get(e.program_id)
    const s = est.get(e.student_id)
    if (!p || !s) continue
    const opciones = colDe.get(e.program_id) ?? []
    const base = {
      enrollment_id: String(e.id), student_id: String(e.student_id),
      estudiante: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' '),
      documento: s.document_number ?? null,
      program_id: String(e.program_id), programa: String(p.name),
      convocatoria_id: e.convocatoria_id ?? null,
      convocatoria: convN.get(e.convocatoria_id) ?? 'sin convocatoria',
      opciones,
    }

    // Un programa de campus externo no se dicta en nuestro Moodle.
    if (p.partner_campus) {
      propuestas.push({ ...base, criterio: 'externo', collection_id: null, coleccion: null, detalle: 'Programa de campus externo' })
      continue
    }

    // 1) Evidencia dura: las aulas donde YA tiene notas. Es dónde estudia de
    // verdad, así que gana a cualquier declaración.
    const votos = new Map<string, number>()
    const aulas = aulasDe.get(String(e.student_id)) ?? aulasDe.get(`doc:${s.document_number ?? ''}`) ?? []
    for (const aula of aulas) {
      const cid = colDeAula.get(aula)
      if (cid && opciones.some(o => o.id === cid)) votos.set(cid, (votos.get(cid) ?? 0) + 1)
    }
    if (votos.size === 1) {
      const [cid, n] = [...votos.entries()][0]
      propuestas.push({ ...base, criterio: 'moodle', collection_id: cid, coleccion: nombreCol.get(cid) ?? null, detalle: `${n} aula(s) de esta colección` })
      continue
    }
    if (votos.size > 1) {
      // Aulas de dos colecciones distintas. Hoy no ocurre en ninguna matrícula,
      // pero si ocurre no se elige la mayoría: se pregunta.
      propuestas.push({
        ...base, criterio: 'pendiente', collection_id: null, coleccion: null,
        detalle: 'Tiene notas en aulas de ' + [...votos.keys()].map(c => nombreCol.get(c) ?? '?').join(' y '),
      })
      continue
    }

    // 2) Lo que declara su convocatoria para ese programa.
    const declarada = parDeConv.get(`${e.convocatoria_id}|${e.program_id}`)
    if (declarada && opciones.some(o => o.id === declarada)) {
      propuestas.push({ ...base, criterio: 'convocatoria', collection_id: declarada, coleccion: nombreCol.get(declarada) ?? null, detalle: base.convocatoria })
      continue
    }

    // 3) Upgrade: convalida medio programa y su programa tiene colección de upgrade.
    const nConv = convalida.get(`${e.student_id}|${e.program_id}`) ?? 0
    const colUp = opciones.find(o => /upgrade/i.test(o.name))
    if (nConv >= UMBRAL_UPGRADE && colUp) {
      propuestas.push({ ...base, criterio: 'upgrade', collection_id: colUp.id, coleccion: colUp.name, detalle: `convalida ${nConv} asignaturas` })
      continue
    }

    // 4) El programa tiene una sola colección: no hay nada que decidir.
    if (opciones.length === 1) {
      propuestas.push({ ...base, criterio: 'unica', collection_id: opciones[0].id, coleccion: opciones[0].name, detalle: 'única colección del programa' })
      continue
    }

    propuestas.push({
      ...base, criterio: 'pendiente', collection_id: null, coleccion: null,
      detalle: opciones.length ? `${opciones.length} colecciones posibles, sin evidencia para elegir` : 'el programa no tiene colecciones',
    })
  }

  const orden: Criterio[] = ['moodle', 'convocatoria', 'upgrade', 'unica', 'externo', 'pendiente']
  const por_criterio = orden.map(c => ({
    criterio: c, etiqueta: ETIQUETA_CRITERIO[c],
    matriculas: propuestas.filter(p => p.criterio === c).length,
  })).filter(x => x.matriculas > 0)

  const mapaBloques = new Map<string, Simulacro['bloques'][number]>()
  for (const p of propuestas.filter(x => x.criterio === 'pendiente')) {
    const k = `${p.program_id}|${p.convocatoria_id ?? '—'}`
    if (!mapaBloques.has(k)) {
      mapaBloques.set(k, {
        program_id: p.program_id, programa: p.programa,
        convocatoria_id: p.convocatoria_id, convocatoria: p.convocatoria,
        matriculas: 0, opciones: p.opciones, estudiantes: [],
      })
    }
    const b = mapaBloques.get(k)!
    b.matriculas++
    if (b.estudiantes.length < 12) b.estudiantes.push(p.estudiante)
  }

  return {
    total: propuestas.length, por_criterio, propuestas,
    bloques: [...mapaBloques.values()].sort((a, b) => b.matriculas - a.matriculas),
  }
}

// Escribe las propuestas que traen colección. Las pendientes NO se tocan: no
// tener colección es mejor que tener la equivocada, porque lo primero se ve en
// el reporte y lo segundo manda a alguien a un aula ajena sin avisar.
export async function aplicarBackfill(
  sb: SB, filtro?: (p: Propuesta) => boolean,
): Promise<{ escritas: number; omitidas: number; error?: string }> {
  const sim = await simularBackfill(sb)
  const elegidas = sim.propuestas
    .filter(p => p.collection_id && p.criterio !== 'pendiente')
    .filter(p => (filtro ? filtro(p) : true))
  let escritas = 0
  for (const p of elegidas) {
    // El where repite collection_id is null: si otra sesión la asignó entre la
    // simulación y la escritura, gana la suya.
    const { error } = await sb.from('academic_student_enrollments')
      .update({ collection_id: p.collection_id })
      .eq('id', p.enrollment_id).is('collection_id', null)
    if (error) return { escritas, omitidas: sim.total - escritas, error: error.message }
    escritas++
  }
  return { escritas, omitidas: sim.total - escritas }
}
