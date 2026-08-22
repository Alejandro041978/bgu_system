import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { asignaturasDeGrupos } from '@/lib/group-courses'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, select: string, filter?: (q: any) => any, orden = 'id'): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select)
    if (filter) q = filter(q)
    const { data, error } = await q.order(orden).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return rows
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readIn(sb: any, table: string, select: string, col: string, ids: string[], orden = 'id'): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150)
    out.push(...await readAll(sb, table, select, q => q.in(col, lote), orden))
  }
  return out
}

interface Group { id: string; program_id: string; abbreviation: string | null; name: string | null; next_group_id: string | null }
const glabel = (g: Group) => g.abbreviation || g.name || g.id

export interface Persona { student_id: string; name: string; document: string | null; colocado: string | null; detalle: string | null; desfase: boolean }
export interface Celda { n: number; desfasados: number; personas: Persona[] }

// ---------------------------------------------------------------------------
// Auditor de carruseles (regla del usuario, 21/08/2026).
//
// Dónde DEBERÍA estar cada estudiante activo se calcula desde sus notas, no se
// lee de la membresía: empieza en el carrusel de inicio de su cadena y avanza
// al siguiente solo si tiene TODAS las asignaturas del actual aprobadas,
// convalidadas o validadas; se detiene en el primero que no cubre. Si cubre
// hasta el último, es egresado por regla.
//
// La cadena del estudiante la da su membresía activa (en programas con dos
// cadenas —regular y upgrade— no se adivina). Sin membresía, cuenta en "Sin
// carrusel", y si el programa tiene una sola cadena se anota a qué carrusel
// iría por regla: es lo que una colocación automática haría con él.
//
// Columnas por programa: sus carruseles con su sigla (ACC_SP2), cadena larga
// primero y hasta seis; más Matriculados (activos), Sin carrusel y Egresados.
// Matriculados = Sin carrusel + Σ carruseles + Egresados, siempre.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()
  const sp = req.nextUrl.searchParams

  if (sp.get('meta')) {
    const cats = await readAll(sb, 'academic_programs_category', 'id, name, sigla', undefined, 'name')
    return NextResponse.json({ categories: cats })
  }
  const categoryId = sp.get('category_id')
  if (!categoryId) return NextResponse.json({ error: 'Falta category_id' }, { status: 400 })

  const { data: cat } = await sb.from('academic_programs_category').select('id, name, passing_score').eq('id', categoryId).maybeSingle()
  const passingCat: number | null = cat?.passing_score ?? null

  const programs: { id: string; name: string; partner_campus: boolean | null }[] =
    await readAll(sb, 'academic_programs', 'id, name, partner_campus', q => q.eq('category_id', categoryId), 'name')
  if (!programs.length) return NextResponse.json({ category: cat?.name ?? null, programs: [] })
  const programIds = programs.map(p => p.id)

  const groups: Group[] = await readIn(sb, 'academic_groups', 'id, program_id, abbreviation, name, next_group_id', 'program_id', programIds)
  const groupOf = new Map(groups.map(g => [g.id, g]))
  const cursosDe = await asignaturasDeGrupos(sb, groups.map(g => g.id))

  // Matriculados activos del programa
  const enrs = await readIn(sb, 'academic_student_enrollments', 'id, student_id, program_id', 'program_id', programIds)
  const studentIds = [...new Set(enrs.map(e => String(e.student_id)))]
  const students = await readIn(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number, situation', 'id', studentIds)
  const activos = new Map(students.filter(s => s.situation === 'activo').map(s => [String(s.id), s]))
  const activosIds = [...activos.keys()]

  const [members, grades, tcs] = await Promise.all([
    readIn(sb, 'academic_group_students', 'student_id, group_id, status', 'student_id', activosIds, 'student_id'),
    readIn(sb, 'academic_grades', 'document_number, course_id, estado_academico, final_grade, retake_grade, passing_score, withdrawn_at', 'document_number',
      [...new Set(activosIds.map(id => String(activos.get(id)?.document_number ?? '')).filter(Boolean))], 'external_id'),
    readIn(sb, 'transfer_credits', 'id, student_id, dest_program_id, status', 'student_id', activosIds),
  ])
  const tcVivos = tcs.filter(t => t.status === 'active')
  const items = tcVivos.length ? await readIn(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id', 'transfer_credit_id', tcVivos.map(t => String(t.id))) : []

  // Cobertura: asignatura aprobada (por estado calculado o por nota ≥ mínimo
  // de la categoría), convalidada o validada.
  const cubiertas = new Map<string, Set<string>>()   // student_id|program_id → course_ids
  const add = (k: string, c: string) => { if (!cubiertas.has(k)) cubiertas.set(k, new Set()); cubiertas.get(k)!.add(c) }
  const docDe = new Map(students.map(s => [String(s.document_number ?? ''), String(s.id)]))
  const programasDe = new Map<string, string[]>()
  for (const e of enrs) programasDe.set(String(e.student_id), [...(programasDe.get(String(e.student_id)) ?? []), String(e.program_id)])
  for (const g of grades) {
    if (g.withdrawn_at || !g.course_id) continue
    const sid = docDe.get(String(g.document_number ?? ''))
    if (!sid) continue
    const v = g.retake_grade ?? g.final_grade
    const est = String(g.estado_academico ?? '')
    const ok = est === 'aprobado' || (est !== 'reprobado' && est !== 'pendiente' && v != null && Number(v) >= Number(passingCat ?? g.passing_score ?? 70))
    if (!ok) continue
    // La nota no dice programa: cubre la asignatura en todos los programas del
    // alumno cuya malla la tenga (filtrado al recorrer la cadena).
    for (const pid of programasDe.get(sid) ?? []) add(`${sid}|${pid}`, String(g.course_id))
  }
  const tcDe = new Map(tcVivos.map(t => [String(t.id), t]))
  for (const it of items) {
    const t = tcDe.get(String(it.transfer_credit_id))
    if (!t || !it.dest_course_id) continue
    add(`${t.student_id}|${t.dest_program_id}`, String(it.dest_course_id))
  }

  // Membresía activa por estudiante × programa; y, si no la hay, la última
  // completada: quien terminó el último carrusel ya no tiene membresía activa
  // y sin esto caía en "Sin carrusel" en vez de en "Egresados" (22/08/2026).
  const miembroDe = new Map<string, Group>()
  const completadaDe = new Map<string, Group>()
  for (const m of members) {
    const g = groupOf.get(String(m.group_id))
    if (!g) continue
    const k = `${m.student_id}|${g.program_id}`
    if (m.status === 'activo') miembroDe.set(k, g)
    else if (m.status === 'completado') {
      // Se queda con la más avanzada de la cadena (la que no apunta a otra
      // completada): basta con preferir la que no tiene siguiente.
      const prev = completadaDe.get(k)
      if (!prev || !g.next_group_id) completadaDe.set(k, g)
    }
  }

  const out = programs.map(p => {
    const propios = groups.filter(g => g.program_id === p.id)
    const apuntados = new Set(propios.map(g => g.next_group_id).filter(Boolean))
    const entradas = propios.filter(g => !apuntados.has(g.id))
    const cadenas: Group[][] = entradas.map(e => {
      const cadena: Group[] = []
      const vistos = new Set<string>()
      let g: Group | undefined = e
      while (g && !vistos.has(g.id)) { vistos.add(g.id); cadena.push(g); g = g.next_group_id ? groupOf.get(g.next_group_id) : undefined }
      return cadena
    }).sort((a, b) => b.length - a.length || glabel(a[0]).localeCompare(glabel(b[0])))
    const cadenaDe = new Map<string, Group[]>()
    for (const c of cadenas) for (const g of c) cadenaDe.set(g.id, c)
    const columnas = cadenas.flat()

    const nombre = (s: { first_name?: string; last_name?: string; second_last_name?: string }) =>
      [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ')
    // Posición por regla a lo largo de una cadena: null = egresado por regla
    const posicion = (sid: string, cadena: Group[]): { group: Group | null; motivo: string } => {
      const cub = cubiertas.get(`${sid}|${p.id}`) ?? new Set<string>()
      for (const g of cadena) {
        const cursos = cursosDe.get(g.id) ?? []
        if (!cursos.length) return { group: g, motivo: 'carrusel sin asignaturas' }
        const faltan = cursos.filter(c => !cub.has(String(c.id)))
        if (faltan.length) return { group: g, motivo: `faltan ${faltan.length} de ${cursos.length}: ${faltan.slice(0, 4).map(c => c.code ?? c.name).join(', ')}${faltan.length > 4 ? '…' : ''}` }
      }
      return { group: null, motivo: 'cubre hasta el último carrusel' }
    }

    const celdas = new Map<string, Celda>(columnas.map(g => [g.id, { n: 0, desfasados: 0, personas: [] }]))
    const sinCarrusel: Celda = { n: 0, desfasados: 0, personas: [] }
    const egresados: Celda = { n: 0, desfasados: 0, personas: [] }
    const vistosProg = new Set<string>()
    for (const e of enrs) {
      if (String(e.program_id) !== p.id) continue
      const sid = String(e.student_id)
      if (vistosProg.has(sid)) continue
      vistosProg.add(sid)
      const s = activos.get(sid)
      if (!s) continue
      const base = { student_id: sid, name: nombre(s), document: s.document_number ?? null }
      const m = miembroDe.get(`${sid}|${p.id}`)
      const comp = !m ? completadaDe.get(`${sid}|${p.id}`) : undefined
      if (!m && comp && cadenaDe.has(comp.id)) {
        // Sin membresía activa pero con carruseles completados: se evalúa su
        // cadena. Si la cubre entera, es egresado por regla (el motor de egreso
        // aún no lo tomó); si no, abandonó la cadena a medias.
        const pos = posicion(sid, cadenaDe.get(comp.id)!)
        if (!pos.group) {
          egresados.n++; egresados.desfasados++
          egresados.personas.push({ ...base, colocado: `${glabel(comp)} (completado)`, detalle: `${pos.motivo} · sigue como activo: pendiente motor de egreso`, desfase: true })
        } else {
          sinCarrusel.n++
          sinCarrusel.personas.push({ ...base, colocado: `${glabel(comp)} (completado)`, detalle: `completó ${glabel(comp)} y no está en ningún carrusel; por regla iría a ${glabel(pos.group)} (${pos.motivo})`, desfase: true })
          sinCarrusel.desfasados++
        }
        continue
      }
      if (!m || !cadenaDe.has(m.id)) {
        // Sin carrusel. Con una sola cadena se anota a dónde iría por regla.
        let detalle: string | null = m ? `colocado en ${glabel(m)}, que no está en ninguna cadena` : null
        if (!m && cadenas.length === 1) {
          const pos = posicion(sid, cadenas[0])
          detalle = pos.group ? `por regla iría a ${glabel(pos.group)} (${pos.motivo})` : 'por regla sería egresado'
        } else if (!m && cadenas.length > 1) detalle = `${cadenas.length} inicios posibles: necesita colocación manual`
        sinCarrusel.n++
        sinCarrusel.personas.push({ ...base, colocado: m ? glabel(m) : null, detalle, desfase: false })
        continue
      }
      const pos = posicion(sid, cadenaDe.get(m.id)!)
      if (!pos.group) {
        egresados.n++
        egresados.personas.push({ ...base, colocado: glabel(m), detalle: `${pos.motivo} · sigue como activo`, desfase: true })
        egresados.desfasados++
        continue
      }
      const celda = celdas.get(pos.group.id)!
      const desfase = pos.group.id !== m.id
      celda.n++
      if (desfase) celda.desfasados++
      celda.personas.push({ ...base, colocado: glabel(m), detalle: desfase ? `colocado en ${glabel(m)} · por regla ${glabel(pos.group)} (${pos.motivo})` : pos.motivo, desfase })
    }
    const orden = (c: Celda) => { c.personas.sort((a, b) => Number(b.desfase) - Number(a.desfase) || a.name.localeCompare(b.name)); return c }

    return {
      program_id: p.id, name: p.name, partner_campus: !!p.partner_campus,
      cadenas: cadenas.length,
      columns: columnas.slice(0, 6).map(g => ({ group_id: g.id, label: glabel(g), name: g.name, asignaturas: (cursosDe.get(g.id) ?? []).length })),
      extra_columns: Math.max(0, columnas.length - 6),
      matriculados: vistosProg.size ? [...vistosProg].filter(id => activos.has(id)).length : 0,
      sin_carrusel: orden(sinCarrusel),
      cells: Object.fromEntries(columnas.slice(0, 6).map(g => [g.id, orden(celdas.get(g.id)!)])),
      egresados: orden(egresados),
    }
  })

  return NextResponse.json({ category: cat?.name ?? null, passing: passingCat, programs: out })
}
