import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Matrículas por convocatoria.
// GET                          → catálogos (programas con categoría, años)
// GET ?program_id=&year_id=    → convocatorias de la categoría del programa en
//                                los semestres de ese año, con el conteo de
//                                matrículas del programa y el total.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const programId = req.nextUrl.searchParams.get('program_id')
  const yearId = req.nextUrl.searchParams.get('year_id')

  if (!programId || !yearId) {
    const [{ data: programs }, { data: years }] = await Promise.all([
      sb.from('academic_programs').select('id, name, category_id, academic_programs_category(name)').order('name'),
      sb.from('academic_years').select('id, name').order('start_date', { ascending: false }),
    ])
    return NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      programs: ((programs ?? []) as any[]).map(p => ({
        id: p.id, name: p.name, category_id: p.category_id, category: p.academic_programs_category?.name ?? '',
      })),
      years: years ?? [],
    })
  }

  const { data: program } = await sb.from('academic_programs')
    .select('id, name, category_id').eq('id', programId).maybeSingle()
  if (!program) return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 })

  const { data: sems } = await sb.from('academic_semesters')
    .select('id, name, start_date').eq('academic_year_id', yearId).order('start_date')
  const semIds = ((sems ?? []) as { id: string }[]).map(s => s.id)
  const semName = new Map(((sems ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let convs: any[] = []
  if (semIds.length && program.category_id) {
    const { data } = await sb.from('convocatorias')
      .select('id, name, academic_semester_id, first_day, deadline_date')
      .eq('product_category_id', program.category_id).in('academic_semester_id', semIds)
      .order('first_day')
    convs = data ?? []
  }

  // Todas las matrículas (tabla chica): conteos por convocatoria, del programa
  // y totales, en una sola pasada
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enr: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('program_id, convocatoria_id').range(from, from + 999)
    const chunk = data ?? []
    enr.push(...chunk)
    if (chunk.length < 1000) break
  }
  const delPrograma = new Map<string, number>()
  const totales = new Map<string, number>()
  let sinConvocatoria = 0
  for (const e of enr as { program_id: string | null; convocatoria_id: string | null }[]) {
    if (e.convocatoria_id) {
      totales.set(e.convocatoria_id, (totales.get(e.convocatoria_id) ?? 0) + 1)
      if (e.program_id === programId) delPrograma.set(e.convocatoria_id, (delPrograma.get(e.convocatoria_id) ?? 0) + 1)
    } else if (e.program_id === programId) sinConvocatoria++
  }

  const rows = convs.map(c => ({
    id: c.id, name: c.name,
    semester: semName.get(c.academic_semester_id) ?? '—',
    first_day: c.first_day, deadline_date: c.deadline_date,
    matriculas_programa: delPrograma.get(c.id) ?? 0,
    matriculas_total: totales.get(c.id) ?? 0,
  }))

  return NextResponse.json({
    program: { id: program.id, name: program.name },
    rows,
    sin_convocatoria: sinConvocatoria,
    total_programa: rows.reduce((s, r) => s + r.matriculas_programa, 0),
  })
}
