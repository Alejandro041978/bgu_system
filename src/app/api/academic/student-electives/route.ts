import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardPagina } from '@/lib/page-guard'
import { stableUuid } from '@/lib/grades-write'
import { recomputeStudentByDocument } from '@/lib/graduates'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Elección de electivas por estudiante — fase 2 (08/09/2026), operada por
// Registros desde el Registro Curricular (permiso academic_curricular; la
// CONFIGURACIÓN de pools vive aparte, con el permiso de Programas).
//
// Efectos de elegir: fila en student_electives (una casilla, una elección),
// matrícula de la ELEGIDA en el registro curricular (source 'electiva', id
// determinista por casilla — reintentar no duplica), specialty_pool_id si es
// especialidad, y recálculo del expediente. La casilla manda los créditos.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contexto(sb: any, studentId: string, programId: string) {
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, specialty_pool_id, academic_students:student_id(document_number)')
    .eq('student_id', studentId).eq('program_id', programId).limit(1).maybeSingle()
  if (!enr) return null
  const [{ data: cursos }, { data: pools }, { data: els }] = await Promise.all([
    sb.from('academic_courses')
      .select('id, code, name, credits, is_elective, graduation_requirement')
      .eq('program_id', programId).order('code'),
    sb.from('elective_pools')
      .select('id, name, tipo, cursos:elective_pool_courses(course_id)')
      .eq('program_id', programId).order('name'),
    sb.from('student_electives')
      .select('slot_course_id, chosen_course_id, pool_id').eq('enrollment_id', enr.id),
  ])
  return { enr, cursos: cursos ?? [], pools: pools ?? [], els: els ?? [] }
}

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_curricular')
  if (noAutorizado) return noAutorizado
  const studentId = req.nextUrl.searchParams.get('student_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!studentId || !programId) return NextResponse.json({ error: 'Faltan student_id y program_id' }, { status: 400 })
  const ctx = await contexto(db(), studentId, programId)
  if (!ctx) return NextResponse.json({ error: 'Sin matrícula en el programa' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nombre = new Map((ctx.cursos as any[]).map(c => [String(c.id), [c.code, c.name].filter(Boolean).join(' · ')]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eleccionDe = new Map((ctx.els as any[]).map(e => [String(e.slot_course_id), e]))
  return NextResponse.json({
    enrollment_id: ctx.enr.id,
    specialty_pool_id: ctx.enr.specialty_pool_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    casillas: (ctx.cursos as any[])
      .filter(c => c.is_elective && c.graduation_requirement !== false)
      .map(c => {
        const el = eleccionDe.get(String(c.id))
        return {
          id: c.id, code: c.code, name: c.name, credits: c.credits,
          eleccion: el ? { course_id: el.chosen_course_id, label: nombre.get(String(el.chosen_course_id)) ?? el.chosen_course_id, pool_id: el.pool_id } : null,
        }
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pools: (ctx.pools as any[]).map(p => ({
      id: p.id, name: p.name, tipo: p.tipo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      courses: (p.cursos ?? []).map((c: any) => ({ id: c.course_id, label: nombre.get(String(c.course_id)) ?? c.course_id })),
    })),
  })
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_curricular')
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const quien = user?.email ?? user?.id ?? 'registros'

  const b = await req.json().catch(() => null) as {
    accion?: string; student_id?: string; program_id?: string
    pool_id?: string; slot_course_id?: string; course_id?: string
  } | null
  if (!b?.accion || !b.student_id || !b.program_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  const sb = db()
  const ctx = await contexto(sb, b.student_id, b.program_id)
  if (!ctx) return NextResponse.json({ error: 'Sin matrícula en el programa' }, { status: 404 })
  const documento = ctx.enr.academic_students?.document_number ?? null
  const ahora = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const casillas = (ctx.cursos as any[]).filter(c => c.is_elective && c.graduation_requirement !== false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eleccionDe = new Map((ctx.els as any[]).map(e => [String(e.slot_course_id), e]))

  // La matrícula de la ELEGIDA: id determinista POR CASILLA — reintentar no
  // duplica, y cambiar la elección (decisión auditada futura) reutiliza la fila.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matricularElegida = async (slotId: string, chosenId: string) => {
    const { error } = await sb.from('academic_course_enrollments').upsert({
      id: stableUuid(`electiva:${ctx.enr.id}:${slotId}`),
      student_id: b.student_id, document_number: documento,
      course_id: chosenId, program_id: b.program_id, program_enrollment_id: ctx.enr.id,
      attempt: 1, status: 'en_curso', source: 'electiva',
      opened_at: ahora, opened_by: `electiva:${quien}`,
    })
    return error
  }

  if (b.accion === 'especialidad') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (ctx.pools as any[]).find(p => String(p.id) === String(b.pool_id))
    if (!pool || pool.tipo !== 'especialidad') return NextResponse.json({ error: 'Pool de especialidad no encontrado' }, { status: 404 })
    if (!casillas.length) return NextResponse.json({ error: 'La malla no tiene casillas electivas' }, { status: 409 })
    if (casillas.some(c => eleccionDe.has(String(c.id)))) {
      return NextResponse.json({ error: 'Ya hay elecciones en las casillas: quítalas antes de asignar una especialidad (se elige completa).' }, { status: 409 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opciones = (pool.cursos ?? []).map((c: any) => String(c.course_id))
    if (opciones.length !== casillas.length) {
      return NextResponse.json({
        error: `La especialidad tiene ${opciones.length} asignatura(s) y la malla ${casillas.length} casilla(s): deben coincidir para elegirla completa.`,
      }, { status: 409 })
    }
    // Casillas y opciones se emparejan en orden de código: determinista y
    // estable entre corridas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nombreCurso = new Map((ctx.cursos as any[]).map(c => [String(c.id), String(c.code ?? c.name ?? '')]))
    const slotsOrden = [...casillas].sort((a, b2) => String(a.code ?? '').localeCompare(String(b2.code ?? '')))
    const opsOrden = [...opciones].sort((a, b2) => (nombreCurso.get(a) ?? '').localeCompare(nombreCurso.get(b2) ?? ''))
    for (let i = 0; i < slotsOrden.length; i++) {
      const { error } = await sb.from('student_electives').insert({
        enrollment_id: ctx.enr.id, slot_course_id: slotsOrden[i].id,
        chosen_course_id: opsOrden[i], pool_id: pool.id, chosen_by: quien,
      })
      if (error) return NextResponse.json({ error: `casilla ${slotsOrden[i].code}: ${error.message}` }, { status: 500 })
      const eM = await matricularElegida(String(slotsOrden[i].id), opsOrden[i])
      if (eM) return NextResponse.json({ error: `matrícula de la elegida: ${eM.message}` }, { status: 500 })
    }
    await sb.from('academic_student_enrollments').update({ specialty_pool_id: pool.id }).eq('id', ctx.enr.id)
    if (documento) await recomputeStudentByDocument(sb, String(documento)).catch(() => null)
    return NextResponse.json({ ok: true, asignadas: slotsOrden.length })
  }

  if (b.accion === 'menu') {
    const slot = casillas.find(c => String(c.id) === String(b.slot_course_id))
    if (!slot) return NextResponse.json({ error: 'Casilla no encontrada' }, { status: 404 })
    if (eleccionDe.has(String(slot.id))) return NextResponse.json({ error: 'Esa casilla ya tiene una elección: quítala primero.' }, { status: 409 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (ctx.pools as any[]).find(p => p.tipo === 'menu' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.cursos ?? []).some((c: any) => String(c.course_id) === String(b.course_id)))
    if (!pool) return NextResponse.json({ error: 'La asignatura no pertenece a ningún menú de electivas del programa' }, { status: 409 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((ctx.els as any[]).some(e => String(e.chosen_course_id) === String(b.course_id))) {
      return NextResponse.json({ error: 'Esa asignatura ya fue elegida en otra casilla' }, { status: 409 })
    }
    const { error } = await sb.from('student_electives').insert({
      enrollment_id: ctx.enr.id, slot_course_id: slot.id,
      chosen_course_id: b.course_id, pool_id: pool.id, chosen_by: quien,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const eM = await matricularElegida(String(slot.id), String(b.course_id))
    if (eM) return NextResponse.json({ error: `matrícula de la elegida: ${eM.message}` }, { status: 500 })
    if (documento) await recomputeStudentByDocument(sb, String(documento)).catch(() => null)
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'quitar') {
    const el = eleccionDe.get(String(b.slot_course_id))
    if (!el) return NextResponse.json({ error: 'Esa casilla no tiene elección' }, { status: 404 })
    // Con notas encima ya es historia académica: quitar la elección sería
    // borrar una cursada — eso va por decisión auditada, no por este botón.
    const { count: notas } = await sb.from('academic_grades')
      .select('external_id', { count: 'exact', head: true })
      .eq('student_id', b.student_id).eq('course_id', el.chosen_course_id)
    if (notas) {
      return NextResponse.json({ error: `La asignatura elegida ya tiene ${notas} nota(s): cambiarla es una decisión auditada, no un destilde.` }, { status: 409 })
    }
    const { error } = await sb.from('student_electives')
      .delete().eq('enrollment_id', ctx.enr.id).eq('slot_course_id', b.slot_course_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // La matrícula creada por esta elección (id determinista) se retira con ella
    await sb.from('academic_course_enrollments')
      .delete().eq('id', stableUuid(`electiva:${ctx.enr.id}:${b.slot_course_id}`))
    // Si era la última elección de la especialidad, la matrícula deja de tenerla
    if (el.pool_id && String(ctx.enr.specialty_pool_id ?? '') === String(el.pool_id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quedan = (ctx.els as any[]).filter(e => String(e.pool_id ?? '') === String(el.pool_id) && String(e.slot_course_id) !== String(b.slot_course_id))
      if (!quedan.length) await sb.from('academic_student_enrollments').update({ specialty_pool_id: null }).eq('id', ctx.enr.id)
    }
    if (documento) await recomputeStudentByDocument(sb, String(documento)).catch(() => null)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Acción desconocida: ${b.accion}` }, { status: 400 })
}
