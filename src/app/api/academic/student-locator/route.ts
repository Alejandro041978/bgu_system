import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface Group { id: string; program_id: string; next_group_id: string | null; abbreviation: string | null; name: string | null }
const glabel = (g: Group) => [g.abbreviation, g.name].filter(Boolean).join(' · ') || g.id

// ---------------------------------------------------------------------------
// Localizador de estudiantes: ¿en qué convocatoria está y en qué carrusel?
//
//   GET ?q=texto        → hasta 10 estudiantes por nombre / documento / correo
//   GET ?student_id=uuid → ese estudiante
//
// Cada estudiante trae sus matrículas con la convocatoria (y las claves de la
// cascada categoría → año → convocatoria, para que una pantalla pueda saltar a
// ella) y su colocación en carrusel. Lo usan el buscador de Estudiantes por
// Convocatoria y la ficha del estudiante: un solo origen para no tener dos
// versiones de "dónde está" (21/08/2026).
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim() ?? ''
  const studentId = sp.get('student_id')
  if (!studentId && q.length < 2) return NextResponse.json({ students: [] })

  const sb = db()
  const cols = 'id, first_name, last_name, second_last_name, document_number, email, situation'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let students: any[] = []
  if (studentId) {
    const { data } = await sb.from('academic_students').select(cols).eq('id', studentId).maybeSingle()
    students = data ? [data] : []
  } else {
    const like = q.replace(/[%,()]/g, '')
    const { data } = await sb.from('academic_students').select(cols)
      .eq('disabled', false)
      .or(`first_name.ilike.%${like}%,last_name.ilike.%${like}%,second_last_name.ilike.%${like}%,document_number.ilike.%${like}%,email.ilike.%${like}%`)
      .limit(10)
    students = data ?? []
  }
  if (!students.length) return NextResponse.json({ students: [] })

  const ids = students.map(s => s.id)
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, convocatoria_id, enrollment_date, status')
    .in('student_id', ids).order('enrollment_date', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matriculas = (enr ?? []) as any[]

  const programIds = [...new Set(matriculas.map(e => e.program_id).filter(Boolean))] as string[]
  const convIds = [...new Set(matriculas.map(e => e.convocatoria_id).filter(Boolean))] as string[]
  const [{ data: progs }, { data: convs }, { data: groups }, { data: members }] = await Promise.all([
    programIds.length ? sb.from('academic_programs').select('id, name').in('id', programIds) : { data: [] },
    convIds.length ? sb.from('convocatorias').select('id, name, product_category_id, academic_semester_id, first_day').in('id', convIds) : { data: [] },
    programIds.length ? sb.from('academic_groups').select('id, program_id, next_group_id, abbreviation, name').in('program_id', programIds) : { data: [] },
    sb.from('academic_group_students').select('student_id, group_id, status').in('student_id', ids),
  ])
  const semIds = [...new Set(((convs ?? []) as { academic_semester_id: string | null }[]).map(c => c.academic_semester_id).filter(Boolean))] as string[]
  const { data: sems } = semIds.length
    ? await sb.from('academic_semesters').select('id, name, academic_year_id').in('id', semIds)
    : { data: [] }

  const progName = new Map(((progs ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convOf = new Map(((convs ?? []) as any[]).map(c => [c.id, c]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semOf = new Map(((sems ?? []) as any[]).map(s => [s.id, s]))
  const groupOf = new Map(((groups ?? []) as Group[]).map(g => [g.id, g]))

  // estudiante → programa → membresía (prefiere la activa: pudo avanzar de grupo)
  const placedOf = new Map<string, { group: Group; status: string }>()
  for (const m of (members ?? []) as { student_id: string; group_id: string; status: string }[]) {
    const g = groupOf.get(m.group_id)
    if (!g) continue
    const key = `${m.student_id}|${g.program_id}`
    const curr = placedOf.get(key)
    if (!curr || (m.status === 'activo' && curr.status !== 'activo')) placedOf.set(key, { group: g, status: m.status })
  }

  const out = students.map(s => ({
    id: s.id,
    name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') || (s.email ?? 'Estudiante'),
    document: s.document_number ?? null,
    situation: s.situation ?? null,
    enrollments: matriculas.filter(e => e.student_id === s.id).map(e => {
      const c = e.convocatoria_id ? convOf.get(e.convocatoria_id) : null
      const sem = c?.academic_semester_id ? semOf.get(c.academic_semester_id) : null
      const placed = placedOf.get(`${s.id}|${e.program_id}`)
      const next = placed?.group.next_group_id ? groupOf.get(placed.group.next_group_id) : null
      return {
        enrollment_id: e.id,
        program_id: e.program_id,
        program: progName.get(e.program_id) ?? '(sin programa)',
        status: e.status,
        fecha: e.enrollment_date ?? null,
        convocatoria: c ? {
          id: c.id, name: c.name, first_day: c.first_day ?? null,
          category_id: c.product_category_id ?? null,
          year_id: sem?.academic_year_id ?? null,
          semester: sem?.name ?? null,
        } : null,
        carrusel: placed ? {
          group_id: placed.group.id, label: glabel(placed.group), status: placed.status,
          next_label: next ? glabel(next) : null,
        } : null,
      }
    }),
  }))

  return NextResponse.json({ students: out })
}
