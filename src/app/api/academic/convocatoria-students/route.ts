import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { fetchByIn } from '@/lib/grades-write'
import { provisionStudent } from '@/lib/moodle-provision'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

interface Group { id: string; program_id: string; next_group_id: string | null; abbreviation: string | null; name: string | null }
const glabel = (g: Group) => [g.abbreviation, g.name].filter(Boolean).join(' · ') || g.id

// Carruseles candidatos para colocar una matrícula del programa: las entradas
// naturales (carruseles a los que ningún otro del programa apunta). Si hay
// varias (ej. variantes por idioma), la elección es humana.
function candidatesFor(programId: string, groups: Group[]): Group[] {
  const ofProgram = groups.filter(g => g.program_id === programId)
  const pointed = new Set(ofProgram.map(g => g.next_group_id).filter(Boolean))
  return ofProgram.filter(g => !pointed.has(g.id))
}

// GET ?convocatoria_id= → estudiantes de la convocatoria con su estado de
// colocación en carruseles: por cada matrícula (estudiante × programa), en qué
// carrusel del programa está, o qué candidatos hay para colocarla.
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria_id')
  if (!convocatoriaId) return NextResponse.json({ error: 'Falta convocatoria_id' }, { status: 400 })

  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enr: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('student_id, program_id, enrollment_date')
      .eq('convocatoria_id', convocatoriaId).range(from, from + 999)
    const chunk = data ?? []
    enr.push(...chunk)
    if (chunk.length < 1000) break
  }

  const programIds = [...new Set(enr.map(e => e.program_id).filter(Boolean))] as string[]
  const { data: progs } = programIds.length
    ? await sb.from('academic_programs').select('id, name').in('id', programIds)
    : { data: [] }
  const progName = new Map(((progs ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))

  const studentIds = [...new Set(enr.map(e => e.student_id).filter(Boolean))] as string[]
  const students = await fetchByIn(sb, 'academic_students',
    'id, document_number, first_name, last_name, second_last_name, situation', 'id', studentIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stuOf = new Map<string, any>(students.map(s => [s.id, s]))

  // Carruseles de los programas involucrados
  const groups: Group[] = programIds.length
    ? (await sb.from('academic_groups').select('id, program_id, next_group_id, abbreviation, name').in('program_id', programIds)).data ?? []
    : []
  const groupOf = new Map(groups.map(g => [g.id, g]))

  // Membresías de estos estudiantes en carruseles de estos programas
  const memberships = groups.length && studentIds.length
    ? await fetchByIn(sb, 'academic_group_students', 'student_id, group_id, status', 'student_id', studentIds)
    : []
  // estudiante → programa → membresía (prefiere la activa: el estudiante pudo avanzar)
  const placedOf = new Map<string, { group: Group; status: string }>()
  for (const m of memberships as { student_id: string; group_id: string; status: string }[]) {
    const g = groupOf.get(m.group_id)
    if (!g) continue
    const key = `${m.student_id}|${g.program_id}`
    const curr = placedOf.get(key)
    if (!curr || (m.status === 'activo' && curr.status !== 'activo')) placedOf.set(key, { group: g, status: m.status })
  }

  // Suma por programa (matrículas) + pendientes de colocar
  const porPrograma = new Map<string, { n: number; sin_colocar: number }>()
  for (const e of enr) {
    const n = progName.get(e.program_id) ?? '(sin programa)'
    const agg = porPrograma.get(n) ?? { n: 0, sin_colocar: 0 }
    agg.n++
    if (!placedOf.has(`${e.student_id}|${e.program_id}`)) agg.sin_colocar++
    porPrograma.set(n, agg)
  }

  // Lista de estudiantes; cada programa lleva su estado de colocación
  interface ProgEntry {
    program_id: string; name: string
    placed: { group_id: string; label: string; status: string } | null
    candidates: { id: string; label: string }[]
  }
  const byStudent = new Map<string, { programs: ProgEntry[]; fecha: string | null }>()
  for (const e of enr) {
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, { programs: [], fecha: e.enrollment_date ?? null })
    const s = byStudent.get(e.student_id)!
    if (!s.programs.some(p => p.program_id === e.program_id)) {
      const placed = placedOf.get(`${e.student_id}|${e.program_id}`)
      s.programs.push({
        program_id: e.program_id,
        name: progName.get(e.program_id) ?? '(sin programa)',
        placed: placed ? { group_id: placed.group.id, label: glabel(placed.group), status: placed.status } : null,
        candidates: placed ? [] : candidatesFor(e.program_id, groups).map(g => ({ id: g.id, label: glabel(g) })),
      })
    }
    if (e.enrollment_date && (!s.fecha || e.enrollment_date < s.fecha)) s.fecha = e.enrollment_date
  }
  const rows = [...byStudent.entries()].map(([sid, v]) => {
    const s = stuOf.get(sid)
    return {
      student_id: sid,
      name: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '?',
      document: s ? String(s.document_number ?? '') : '',
      situation: s?.situation ?? null,
      programs: v.programs,
      fecha: v.fecha,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const sinColocar = [...porPrograma.values()].reduce((s, v) => s + v.sin_colocar, 0)

  return NextResponse.json({
    matriculas: enr.length,
    estudiantes: rows.length,
    sin_colocar: sinColocar,
    por_programa: [...porPrograma.entries()].sort((a, b) => b[1].n - a[1].n)
      .map(([programa, v]) => ({ programa, n: v.n, sin_colocar: v.sin_colocar })),
    rows,
  })
}

// POST { student_id, program_id, group_id } → coloca la matrícula en el
// carrusel elegido: membresía activa + matrícula en las aulas Moodle del grupo.
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { student_id, program_id, group_id } = (body ?? {}) as { student_id?: string; program_id?: string; group_id?: string }
  if (!student_id || !program_id || !group_id) {
    return NextResponse.json({ error: 'Faltan student_id, program_id o group_id' }, { status: 400 })
  }

  const sb = db()
  const { data: group } = await sb.from('academic_groups')
    .select('id, program_id, abbreviation, name, next_group_id').eq('id', group_id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Carrusel no encontrado' }, { status: 404 })
  if (group.program_id !== program_id) {
    return NextResponse.json({ error: 'El carrusel no pertenece al programa de la matrícula' }, { status: 400 })
  }

  // Si ya está en algún carrusel del programa, no colocar de nuevo (pudo avanzar)
  const { data: gs } = await sb.from('academic_groups').select('id').eq('program_id', program_id)
  const programGroupIds = ((gs ?? []) as { id: string }[]).map(g => g.id)
  const { data: existing } = await sb.from('academic_group_students')
    .select('group_id, status').eq('student_id', student_id).in('group_id', programGroupIds)
  if ((existing ?? []).length) {
    return NextResponse.json({ ok: false, error: 'El estudiante ya está en un carrusel de este programa' }, { status: 409 })
  }

  const { error } = await sb.from('academic_group_students')
    .insert({ group_id, student_id, status: 'activo' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const moodle = await provisionStudent(group_id, student_id, 'enrol')
  return NextResponse.json({
    ok: true,
    group_label: glabel(group as Group),
    moodle: {
      configured: moodle.configured,
      enrol_ops: moodle.enrol_ops,
      courses_unmapped: moodle.courses_unmapped,
      errors: moodle.errors,
    },
  })
}
