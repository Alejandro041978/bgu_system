import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { fetchByIn } from '@/lib/grades-write'
import { guardStaff } from '@/lib/api-guard'

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

// GET ?convocatoria_id= → estudiantes de la convocatoria con su estado de
// colocación en carruseles: por cada matrícula (estudiante × programa), en qué
// carrusel del programa está, o qué candidatos hay para colocarla.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria_id')
  if (!convocatoriaId) return NextResponse.json({ error: 'Falta convocatoria_id' }, { status: 400 })

  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enr: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('id, student_id, program_id, enrollment_date, status, entry_group_id')
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
    enrollment_id?: string
    pending_payment?: boolean
    placed: { group_id: string; label: string; status: string } | null
    // Carrusel CARGADO en la matrícula por quien la registró (se ejecuta al activarse)
    loaded: { group_id: string; label: string } | null
  }
  const byStudent = new Map<string, { programs: ProgEntry[]; fecha: string | null }>()
  for (const e of enr) {
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, { programs: [], fecha: e.enrollment_date ?? null })
    const s = byStudent.get(e.student_id)!
    if (!s.programs.some(p => p.program_id === e.program_id)) {
      const placed = placedOf.get(`${e.student_id}|${e.program_id}`)
      const pending = e.status === 'pendiente_pago'
      s.programs.push({
        program_id: e.program_id,
        name: progName.get(e.program_id) ?? '(sin programa)',
        enrollment_id: e.id,
        pending_payment: pending,
        placed: placed ? { group_id: placed.group.id, label: glabel(placed.group), status: placed.status } : null,
        loaded: (() => { const g = e.entry_group_id ? groupOf.get(e.entry_group_id) : null; return g ? { group_id: g.id, label: glabel(g) } : null })(),
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

// POST retirado (17/09/2026): el reporte es SOLO un reflejo (regla del usuario:
// la vendedora carga, el pago ejecuta, los reportes reflejan). La colocación la
// ejecuta la activación con el carrusel cargado en la matrícula; lo cargado se
// corrige en la ficha del estudiante.
export async function POST() {
  return NextResponse.json({ error: 'Este reporte es de solo lectura: la colocación la ejecuta la activación de la matrícula. Corrige lo cargado en la ficha del estudiante.' }, { status: 410 })
}
