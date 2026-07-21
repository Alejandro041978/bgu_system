import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, select: string, filter?: (q: any) => any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return rows
}

// Tablero de cobertura de carruseles: todo alumno ACTIVO debe vivir en un
// carrusel (pertenecer a uno = tener acceso a sus aulas Moodle). Por categoría:
// los carruseles con sus conteos, y abajo los activos sin carrusel (típicamente
// programas con varias entradas, donde la colocación es decisión humana).
// GET ?category_id=
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const categoryId = req.nextUrl.searchParams.get('category_id')
  const sb = db()

  const { data: cats } = await sb.from('academic_programs_category').select('id, name').order('name')
  if (!categoryId) return NextResponse.json({ categories: cats ?? [], groups: [], unplaced: [] })

  // Programas de la categoría y sus carruseles
  const { data: progs } = await sb.from('academic_programs')
    .select('id, name').eq('category_id', categoryId).order('name')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (progs ?? []) as any[]
  const programIds = programs.map(p => p.id)
  const progName = new Map<string, string>(programs.map(p => [p.id, p.name]))
  if (!programIds.length) return NextResponse.json({ categories: cats ?? [], groups: [], unplaced: [] })

  const { data: gs } = await sb.from('academic_groups')
    .select('id, program_id, next_group_id, abbreviation, name').in('program_id', programIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = (gs ?? []) as any[]
  const groupIds = groups.map(g => g.id)

  // Posición en la cadena (1 = entrada) por programa
  const pos = new Map<string, number>()
  const byProgram = new Map<string, typeof groups>()
  for (const g of groups) {
    if (!byProgram.has(g.program_id)) byProgram.set(g.program_id, [])
    byProgram.get(g.program_id)!.push(g)
  }
  const entriesOf = new Map<string, string[]>()   // programa → carruseles de entrada
  for (const [pid, list] of byProgram) {
    const pointed = new Set(list.map(g => g.next_group_id).filter(Boolean))
    const entries = list.filter(g => !pointed.has(g.id))
    entriesOf.set(pid, entries.map(g => g.id))
    for (const e of entries) {
      let cur = e, p = 1, hops = 0
      while (cur && hops++ < 20) {
        pos.set(cur.id, p++)
        cur = list.find(g => g.id === cur.next_group_id)
      }
    }
  }

  // Membresías de los carruseles de la categoría
  const memberships = groupIds.length
    ? await readAll(sb, 'academic_group_students', 'group_id, student_id, status',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.in('group_id', groupIds))
    : []
  const groupOfId = new Map(groups.map(g => [g.id, g]))
  const activos = new Map<string, number>(), completados = new Map<string, number>()
  const covered = new Set<string>()               // `${student}|${program}`
  for (const m of memberships) {
    const g = groupOfId.get(m.group_id)
    if (!g) continue
    covered.add(`${m.student_id}|${g.program_id}`)
    if (m.status === 'activo') activos.set(m.group_id, (activos.get(m.group_id) ?? 0) + 1)
    else if (m.status === 'completado') completados.set(m.group_id, (completados.get(m.group_id) ?? 0) + 1)
  }

  // Matrículas de la categoría → activos que deberían estar en un carrusel
  // (las 'pendiente_pago' no cuentan: aún no compraron el acceso)
  const enrAll = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id, status',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => q.in('program_id', programIds))
  const enr = enrAll.filter(e => e.status !== 'pendiente_pago')
  const studentIds = [...new Set(enr.map(e => e.student_id).filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = new Map<string, any>()
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, situation')
      .in('id', studentIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) students.set(s.id, s)
  }

  const seen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unplaced: any[] = []
  let activosEnCarrusel = 0, activosTotal = 0
  for (const e of enr) {
    const key = `${e.student_id}|${e.program_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const s = students.get(e.student_id)
    if (!s) continue
    if (s.situation && s.situation !== 'activo') continue   // retirados, egresados, LOA, campus socio… fuera
    activosTotal++                                          // matrículas activas (estudiante × programa)
    if (covered.has(key)) { activosEnCarrusel++; continue }
    const candidates = (entriesOf.get(e.program_id) ?? []).map(id => {
      const g = groupOfId.get(id)
      return { id, label: [g?.abbreviation, g?.name].filter(Boolean).join(' · ') || id }
    })
    unplaced.push({
      student_id: e.student_id,
      name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      document: String(s.document_number ?? ''),
      program_id: e.program_id,
      program: progName.get(e.program_id) ?? '',
      candidates,
    })
  }
  unplaced.sort((a, b) => a.program.localeCompare(b.program) || a.name.localeCompare(b.name))

  const groupRows = groups.map(g => ({
    id: g.id,
    program: progName.get(g.program_id) ?? '',
    label: [g.abbreviation, g.name].filter(Boolean).join(' · ') || g.id,
    position: pos.get(g.id) ?? null,
    is_last: !g.next_group_id,
    activos: activos.get(g.id) ?? 0,
    completados: completados.get(g.id) ?? 0,
  })).sort((a, b) => a.program.localeCompare(b.program) || (a.position ?? 99) - (b.position ?? 99))

  return NextResponse.json({
    categories: cats ?? [],
    groups: groupRows,
    unplaced,
    resumen: {
      carruseles: groups.length,
      activos_total: activosTotal,
      activos_en_carrusel: activosEnCarrusel,
      sin_carrusel: unplaced.length,
    },
  })
}
