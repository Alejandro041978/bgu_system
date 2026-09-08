import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardPagina } from '@/lib/page-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Electivas — fase 1: configuración (08/09/2026).
//
// La malla tiene CASILLAS (is_elective, se marcan en Programas) y el programa
// tiene POOLS de opciones: 'menu' (se eligen asignaturas sueltas) o
// 'especialidad' (se elige el pool completo y llena las casillas). Las
// opciones son asignaturas del MISMO programa con graduation_requirement=false
// — fuera de la malla exigible, con aulas y notas normales.
//
// La malla la regula la Dirección Académica: mismo permiso que Programas.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_programs')
  if (noAutorizado) return noAutorizado
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!programId) return NextResponse.json({ error: 'Falta program_id' }, { status: 400 })
  const sb = db()

  const [{ data: cursos }, { data: pools }, { data: pcs }] = await Promise.all([
    sb.from('academic_courses')
      .select('id, code, name, credits, is_elective, graduation_requirement, is_capstone')
      .eq('program_id', programId).order('code'),
    sb.from('elective_pools').select('id, name, tipo, nota').eq('program_id', programId).order('name'),
    sb.from('elective_pools').select('id, cursos:elective_pool_courses(course_id)').eq('program_id', programId),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursosDePool = new Map<string, string[]>(((pcs ?? []) as any[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(p => [String(p.id), (p.cursos ?? []).map((c: any) => String(c.course_id))]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todos = (cursos ?? []) as any[]

  return NextResponse.json({
    // Las casillas de la malla que la elección deberá llenar
    casillas: todos.filter(c => c.is_elective && c.graduation_requirement !== false),
    // El catálogo de opciones: fuera de la malla exigible, sin ser casilla
    opciones: todos.filter(c => c.graduation_requirement === false && !c.is_elective),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pools: ((pools ?? []) as any[]).map(p => ({ ...p, course_ids: cursosDePool.get(String(p.id)) ?? [] })),
  })
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_programs')
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const quien = user?.email ?? user?.id ?? null

  const b = await req.json().catch(() => null) as {
    accion?: string; program_id?: string; pool_id?: string; course_id?: string
    name?: string; tipo?: string; nota?: string; code?: string; credits?: number
  } | null
  if (!b?.accion) return NextResponse.json({ error: 'Falta accion' }, { status: 400 })
  const sb = db()

  if (b.accion === 'pool_crear') {
    if (!b.program_id || !b.name?.trim() || !['menu', 'especialidad'].includes(String(b.tipo))) {
      return NextResponse.json({ error: 'Faltan datos: program_id, name y tipo (menu|especialidad)' }, { status: 400 })
    }
    const { data, error } = await sb.from('elective_pools').insert({
      program_id: b.program_id, name: b.name.trim(), tipo: b.tipo, nota: b.nota?.trim() || null, created_by: quien,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, pool: data })
  }

  if (b.accion === 'pool_eliminar') {
    if (!b.pool_id) return NextResponse.json({ error: 'Falta pool_id' }, { status: 400 })
    // Un pool con elecciones o elegido como especialidad es historia académica.
    const { count: elecciones } = await sb.from('student_electives')
      .select('id', { count: 'exact', head: true }).eq('pool_id', b.pool_id)
    const { count: matriculas } = await sb.from('academic_student_enrollments')
      .select('id', { count: 'exact', head: true }).eq('specialty_pool_id', b.pool_id)
    if (elecciones || matriculas) {
      return NextResponse.json({
        error: `No se puede eliminar: ${elecciones ?? 0} elección(es) y ${matriculas ?? 0} matrícula(s) lo referencian.`,
      }, { status: 409 })
    }
    const { error } = await sb.from('elective_pools').delete().eq('id', b.pool_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'pool_agregar_curso' || b.accion === 'pool_quitar_curso') {
    if (!b.pool_id || !b.course_id) return NextResponse.json({ error: 'Faltan pool_id y course_id' }, { status: 400 })
    if (b.accion === 'pool_quitar_curso') {
      const { error } = await sb.from('elective_pool_courses')
        .delete().eq('pool_id', b.pool_id).eq('course_id', b.course_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    // Solo opciones legítimas: del mismo programa del pool, fuera de la malla
    // exigible y sin ser casilla — decisión del usuario (a): las opciones son
    // asignaturas de UN solo programa, no un catálogo transversal.
    const { data: pool } = await sb.from('elective_pools').select('program_id').eq('id', b.pool_id).maybeSingle()
    const { data: curso } = await sb.from('academic_courses')
      .select('program_id, graduation_requirement, is_elective').eq('id', b.course_id).maybeSingle()
    if (!pool || !curso) return NextResponse.json({ error: 'Pool o asignatura no encontrados' }, { status: 404 })
    if (String(curso.program_id) !== String(pool.program_id)) {
      return NextResponse.json({ error: 'La asignatura es de otro programa: las opciones son del mismo programa del pool.' }, { status: 409 })
    }
    if (curso.is_elective) {
      return NextResponse.json({ error: 'Esa asignatura es una CASILLA electiva de la malla, no una opción.' }, { status: 409 })
    }
    if (curso.graduation_requirement !== false) {
      return NextResponse.json({ error: 'Una opción debe estar fuera de la malla exigible: quítale "requisito de graduación" en Programas primero.' }, { status: 409 })
    }
    const { error } = await sb.from('elective_pool_courses')
      .upsert({ pool_id: b.pool_id, course_id: b.course_id }, { onConflict: 'pool_id,course_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'opcion_crear') {
    if (!b.program_id || !b.name?.trim()) return NextResponse.json({ error: 'Faltan program_id y name' }, { status: 400 })
    const { data, error } = await sb.from('academic_courses').insert({
      program_id: b.program_id, name: b.name.trim(), code: b.code?.trim() || null,
      credits: b.credits ?? null,
      // Nace como opción: fuera de la malla exigible, jamás casilla.
      graduation_requirement: false, is_elective: false,
    }).select('id, code, name, credits').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, curso: data })
  }

  return NextResponse.json({ error: `Acción desconocida: ${b.accion}` }, { status: 400 })
}
