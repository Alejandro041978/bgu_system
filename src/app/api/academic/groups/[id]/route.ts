import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { asignaturasDeGrupo } from '@/lib/group-courses'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → detalle del grupo: asignaturas del grupo (con fechas y aula Moodle) y estudiantes.
// Las asignaturas se asignan/quitan en Oferta Académica; aquí son de solo lectura
// (salvo el ID de curso Moodle, que se edita aquí).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const sb = db()

  const { data: group } = await sb.from('academic_groups')
    .select('id, abbreviation, name, detail, program_id, next_group_id, academic_programs(name)')
    .eq('id', id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // Secuencia de carruseles del programa: hermanos (para el selector de
  // siguiente), quién desemboca en este, y si es el carrusel de entrada
  // (nadie lo apunta).
  const { data: sibs } = await sb.from('academic_groups')
    .select('id, abbreviation, name, next_group_id')
    .eq('program_id', group.program_id)
  const label = (g: { abbreviation: string | null; name: string | null }) =>
    [g.abbreviation, g.name].filter(Boolean).join(' · ') || '(sin nombre)'
  const prev = (sibs ?? []).find((g: { id: string; next_group_id: string | null }) => g.id !== id && g.next_group_id === id)
  const sequence = {
    next_group_id: group.next_group_id ?? null,
    is_entry: !prev,
    prev_label: prev ? label(prev) : null,
    siblings: (sibs ?? []).filter((g: { id: string }) => g.id !== id)
      .map((g: { id: string; abbreviation: string | null; name: string | null }) => ({ id: g.id, label: label(g) })),
  }

  const OFF = 'id, start_date, end_date, moodle_course_id, course:academic_courses(id, name, code), assignments:faculty_assignments(employee:hr_employees(full_name))'
  const [{ data: offerings }, { data: members }, asignaturas, { data: malla }] = await Promise.all([
    sb.from('semester_offerings').select(OFF).eq('group_id', id).order('start_date', { ascending: false, nullsFirst: false }),
    sb.from('academic_group_students').select('student_id, academic_students(id, first_name, last_name, second_last_name, document_number)').eq('group_id', id),
    // Lo que el carrusel DICTA. La oferta de abajo solo dice cuándo y quién.
    asignaturasDeGrupo(sb, id),
    sb.from('academic_courses').select('id, code, name').eq('program_id', group.program_id).order('code'),
  ])

  // El aula de cada asignatura sale de la COLECCIÓN (una sola vez, igual en
  // todas las vueltas del carrusel), no de la fila de oferta. El campo por
  // oferta era herencia de la época pre-colecciones: pedía el aula una vez por
  // cronograma y las vueltas repetidas quedaban vacías o copiadas a mano
  // (regla del usuario, 07/09/2026). moodle_course_id se conserva congelado
  // como respaldo legado para matrículas sin colección.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursoIdsOff = [...new Set(((offerings ?? []) as any[]).map(o => o.course?.id).filter(Boolean).map(String))]
  const aulasDeCurso = new Map<string, { aula: number; coleccion: string }[]>()
  if (cursoIdsOff.length) {
    const { data: links } = await sb.from('moodle_course_links')
      .select('aula_id, course_id, collection_id').eq('kind', 'asignatura').is('replaced_at', null)
      .in('course_id', cursoIdsOff)
    const colIds = [...new Set(((links ?? []) as { collection_id: string | null }[]).map(l => l.collection_id).filter(Boolean))]
    const { data: cols } = colIds.length
      ? await sb.from('moodle_collections').select('id, name').in('id', colIds)
      : { data: [] }
    const nombreCol = new Map(((cols ?? []) as { id: string; name: string }[]).map(c => [String(c.id), c.name]))
    for (const l of (links ?? []) as { aula_id: number; course_id: string; collection_id: string | null }[]) {
      const k = String(l.course_id)
      if (!aulasDeCurso.has(k)) aulasDeCurso.set(k, [])
      aulasDeCurso.get(k)!.push({ aula: Number(l.aula_id), coleccion: l.collection_id ? (nombreCol.get(String(l.collection_id)) ?? '—') : 'sin colección' })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapOff = (o: any) => ({
    id: o.id,
    course_name: o.course?.name ?? '—',
    course_code: o.course?.code ?? null,
    teacher: o.assignments?.[0]?.employee?.full_name ?? null,
    start_date: o.start_date ?? null,
    end_date: o.end_date ?? null,
    moodle_course_id: o.moodle_course_id ?? null,
    aulas_coleccion: o.course?.id ? (aulasDeCurso.get(String(o.course.id)) ?? []) : [],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = (members ?? []).map((m: any) => {
    const s = m.academic_students
    return { id: s?.id ?? m.student_id, name: [s?.first_name, s?.last_name, s?.second_last_name].filter(Boolean).join(' '), document_number: s?.document_number ?? null }
  }).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

  // Las que la oferta programa pero el carrusel ya no dicta. Es el contraste
  // entre las dos tablas, y sale a la vista en vez de quedar como una
  // diferencia que nadie compara.
  const dicta = new Set(asignaturas.map(c => String(c.id)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ofertadasDeMas = [...new Set(((offerings ?? []) as any[])
    .filter(o => o.course?.id && !dicta.has(String(o.course.id)))
    .map(o => o.course?.name as string))]

  return NextResponse.json({
    group: {
      id: group.id, abbreviation: group.abbreviation, name: group.name, detail: group.detail,
      program_name: group.academic_programs?.name ?? '',
    },
    sequence,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses: asignaturas.map((c: any) => ({ id: c.id, code: c.code, name: c.name, credits: c.credits ?? null })),
    malla: (malla ?? []).map((c: { id: string; code: string | null; name: string }) => ({ id: c.id, code: c.code, name: c.name })),
    ofertadas_de_mas: ofertadasDeMas,
    offerings: (offerings ?? []).map(mapOff),
    students,
  })
}
