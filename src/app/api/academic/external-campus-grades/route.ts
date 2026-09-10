import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { listar, editar } from '@/lib/scoped-grades-api'
import { cursosDelAmbito } from '@/lib/grade-scope'
import { guardPagina } from '@/lib/page-guard'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Notas de los programas de campus externo: los que se dictan en otra
// institución y cuya calificación vive en el LMS de esa institución. El motor
// es el mismo de la otra página acotada (lib/scoped-grades-api); aquí solo se
// fija el ámbito.
//
// GET ?vista=marcados → los pares estudiante+asignatura marcados individualmente.
// POST {action: 'marcar'|'desmarcar', student_id, course_id, note?} → gestiona
// la marca individual (mismo permiso del ámbito). Efectos de marcar: nota
// manual aquí, el importador lo salta y el aprovisionador lo excluye del aula.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('vista') === 'marcados') return listarMarcados()
  if (req.nextUrl.searchParams.get('vista') === 'cursos') return cursosDeEstudiante(req)
  return listar('campus_externo', req)
}

// Asignaturas del estudiante donde ya existe una CALIFICACIÓN viva (final o
// subsanación, en cualquier intento no retirado). Regla del usuario
// (10/09/2026): una asignatura calificada —aprobada O desaprobada— no se marca
// como campus externo; el acta es un hecho y esta vía no la reabre. Las notas
// viejas pueden vivir solo con documento, así que se mira por ambas llaves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cursosConNota(sb: any, studentId: string, courseIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!courseIds.length) return out
  const { data: est } = await sb.from('academic_students')
    .select('document_number').eq('id', studentId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marcar = (rows: any[]) => {
    for (const g of rows) if (g.final_grade != null || g.retake_grade != null) out.add(String(g.course_id))
  }
  for (let i = 0; i < courseIds.length; i += 200) {
    const lote = courseIds.slice(i, i + 200)
    const { data: porUuid } = await sb.from('academic_grades')
      .select('course_id, final_grade, retake_grade')
      .eq('student_id', studentId).in('course_id', lote).is('withdrawn_at', null)
    marcar(porUuid ?? [])
    if (est?.document_number != null) {
      const { data: porDoc } = await sb.from('academic_grades')
        .select('course_id, final_grade, retake_grade')
        .eq('document_number', String(est.document_number)).in('course_id', lote).is('withdrawn_at', null)
      marcar(porDoc ?? [])
    }
  }
  return out
}

// Las asignaturas inscritas (vivas) de un estudiante, para elegir cuál cursa
// fuera. Se ofrecen las de aula normal (las de ámbito completo no necesitan
// marca individual) y SIN calificación: una "en curso" sin nota final sí; una
// aprobada o desaprobada, no.
async function cursosDeEstudiante(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_external_campus_marks', 'view')
  if (noAutorizado) return noAutorizado
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })
  const sb = db()
  const { data, error } = await sb.from('academic_course_enrollments')
    .select('course_id, status, course:academic_courses(id, code, name)')
    .eq('student_id', studentId).neq('status', 'retirada')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ambito = await cursosDelAmbito(sb, 'campus_externo')
  const vistos = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatos = ((data ?? []) as any[])
    .filter(r => r.course && !ambito.has(String(r.course_id)) && !vistos.has(String(r.course_id)) && vistos.add(String(r.course_id)))
  const conNota = await cursosConNota(sb, studentId, candidatos.map(r => String(r.course_id)))
  const cursos = candidatos
    .filter(r => !conNota.has(String(r.course_id)))
    .map(r => ({ id: String(r.course.id), code: r.course.code, name: r.course.name }))
    .sort((a, b) => String(a.code ?? a.name).localeCompare(String(b.code ?? b.name)))
  return NextResponse.json({ cursos, con_nota: conNota.size })
}
export async function PATCH(req: NextRequest) { return editar('campus_externo', req) }

async function listarMarcados() {
  const noAutorizado = await guardPagina('academic_external_campus_marks', 'view')
  if (noAutorizado) return noAutorizado
  const sb = db()
  const { data, error } = await sb.from('external_campus_students')
    .select('id, student_id, course_id, note, created_by, created_at, student:academic_students(first_name, last_name, second_last_name, document_number), course:academic_courses(code, name)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marcados = ((data ?? []) as any[]).map(r => ({
    id: r.id, student_id: r.student_id, course_id: r.course_id,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
    course: [r.course?.code, r.course?.name].filter(Boolean).join(' · '),
    note: r.note, created_by: r.created_by, created_at: r.created_at,
  }))
  return NextResponse.json({ marcados })
}

export async function POST(req: NextRequest) {
  // Marcar/desmarcar es del permiso de MARCAR, no del de calificar.
  const noAutorizado = await guardPagina('academic_external_campus_marks')
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()

  const b = await req.json().catch(() => null) as
    { action?: 'marcar' | 'desmarcar'; student_id?: string; course_id?: string; note?: string } | null
  if (!b?.action || !b.student_id || !b.course_id) {
    return NextResponse.json({ error: 'Faltan action, student_id y course_id' }, { status: 400 })
  }
  const sb = db()

  if (b.action === 'desmarcar') {
    const { error } = await sb.from('external_campus_students')
      .delete().eq('student_id', b.student_id).eq('course_id', b.course_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      aviso: 'Marca retirada: el importador vuelve a considerar su aula de Moodle en esta asignatura (una nota ya ingresada a mano queda blindada) y el reconciliador puede volver a matricularlo en el aula.',
    })
  }

  const { data: est } = await sb.from('academic_students').select('id, first_name, last_name').eq('id', b.student_id).maybeSingle()
  if (!est) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  const { data: cur } = await sb.from('academic_courses').select('id, code, name').eq('id', b.course_id).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'Asignatura no encontrada' }, { status: 404 })
  // Marcar un par de una asignatura que YA es de ámbito completo no hace nada
  // y confunde el registro: se rechaza con la explicación.
  if ((await cursosDelAmbito(sb, 'campus_externo')).has(String(cur.id))) {
    return NextResponse.json({ error: `${cur.code ?? cur.name} ya pertenece por completo al campus externo: no hace falta marcar estudiantes individuales.` }, { status: 409 })
  }
  // Una asignatura ya calificada —aprobada o desaprobada— no se marca: el acta
  // es un hecho y esta vía no la reabre (regla del usuario, 10/09/2026).
  if ((await cursosConNota(sb, String(est.id), [String(cur.id)])).size) {
    return NextResponse.json({ error: `${cur.code ?? cur.name} ya tiene calificación para este estudiante: una asignatura calificada no se marca como campus externo.` }, { status: 409 })
  }

  const { error } = await sb.from('external_campus_students').insert({
    student_id: b.student_id, course_id: b.course_id,
    note: (b.note ?? '').trim() || null,
    created_by: user?.email ?? user?.id ?? null,
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: 'Ese estudiante ya está marcado en esa asignatura.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    aviso: 'Marcado: su nota se ingresa aquí, el importador lo salta en esta asignatura y el reconciliador lo excluirá del aula de Moodle en su próxima pasada.',
  })
}
