import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { sameCourse } from '@/lib/course-match'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gradeStatus(g: any, passing: number | null): { status: string; grade: number | null; has_grade: boolean } {
  const v = (g.retake_grade ?? g.final_grade) as number | null
  if (v == null) return { status: 'en_proceso', grade: null, has_grade: false }
  const p = g.passing_score ?? passing
  const ok = p != null ? Number(v) >= Number(p) : true
  return { status: ok ? 'aprobado' : 'desaprobado', grade: v, has_grade: true }
}

// GET ?student_id=&program_id= → inscripciones (academic_grades) del estudiante
// que pertenecen a la malla del programa + resumen de créditos/precio.
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const studentId = req.nextUrl.searchParams.get('student_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!studentId || !programId) return NextResponse.json({ error: 'Falta student_id o program_id' }, { status: 400 })

  const { data: student } = await sb.from('academic_students').select('document_number').eq('id', studentId).maybeSingle()
  if (!student?.document_number) return NextResponse.json({ error: 'Estudiante sin documento' }, { status: 404 })

  const { data: program } = await sb.from('academic_programs').select('id, name, category_id').eq('id', programId).maybeSingle()
  let categoryPassing: number | null = null
  if (program?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', program.category_id).maybeSingle()
    categoryPassing = cat?.passing_score ?? null
  }

  const { data: courses } = await sb.from('academic_courses').select('code, name, credits').eq('program_id', programId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const malla = (courses ?? []) as any[]
  const belongs = (g: { course_code: string | null; course_name: string | null }) =>
    malla.some(c => (c.code && g.course_code && String(c.code) === String(g.course_code)) || sameCourse(g.course_name, c.name))

  const { data: grades } = await sb.from('academic_grades')
    .select('external_id, course_code, course_name, credits, term_year, term_block, final_grade, retake_grade, passing_score, withdrawn_at, source')
    .eq('document_number', student.document_number).neq('source', 'convalidacion').neq('source', 'validacion')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((grades ?? []) as any[]).filter(belongs).map(g => {
    const st = gradeStatus(g, categoryPassing)
    return {
      external_id: g.external_id, course_code: g.course_code, course_name: g.course_name,
      credits: g.credits != null ? Number(g.credits) : null,
      term: [g.term_year, g.term_block].filter(Boolean).join(' · '),
      ...st, withdrawn: !!g.withdrawn_at,
    }
  }).sort((a, b) => String(a.course_name).localeCompare(String(b.course_name)))

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, list_price, credit_rate, credit_rate_source').eq('student_id', studentId).eq('program_id', programId)
    .order('list_price', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()

  const creditosActivos = rows.filter(r => !r.withdrawn).reduce((s, r) => s + (r.credits ?? 0), 0)

  return NextResponse.json({
    program: program?.name ?? '',
    enrollment: enr ? { id: enr.id, list_price: enr.list_price != null ? Number(enr.list_price) : null, credit_rate: enr.credit_rate != null ? Number(enr.credit_rate) : null } : null,
    creditos_activos: creditosActivos,
    rows,
  })
}

// POST { external_id, student_id, program_id } → retira la asignatura (sin notas)
// Recalcula el Total Tuition: list_price de la matrícula −= tarifa × créditos.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { external_id?: string; student_id?: string; program_id?: string } | null
  if (!b?.external_id || !b?.student_id || !b?.program_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const sb = db()
  const { data: g } = await sb.from('academic_grades')
    .select('external_id, document_number, credits, final_grade, retake_grade, withdrawn_at, source').eq('external_id', b.external_id).maybeSingle()
  if (!g) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
  if (g.source === 'convalidacion' || g.source === 'validacion') return NextResponse.json({ error: 'Una convalidación/validación no se retira aquí' }, { status: 400 })
  if (g.withdrawn_at) return NextResponse.json({ error: 'Esta asignatura ya está retirada' }, { status: 409 })
  // Compuerta: solo si NO hay calificaciones
  if (g.final_grade != null || g.retake_grade != null) {
    return NextResponse.json({ error: 'No se puede retirar: la asignatura ya tiene calificaciones' }, { status: 409 })
  }
  // La inscripción debe ser del estudiante indicado
  const { data: stu } = await sb.from('academic_students').select('document_number').eq('id', b.student_id).maybeSingle()
  if (!stu || String(stu.document_number) !== String(g.document_number)) {
    return NextResponse.json({ error: 'La inscripción no pertenece a ese estudiante' }, { status: 400 })
  }

  // Marcar retirada
  const { error: wErr } = await sb.from('academic_grades')
    .update({ withdrawn_at: new Date().toISOString(), withdrawn_by: user.email ?? user.id }).eq('external_id', b.external_id)
  if (wErr) return NextResponse.json({ error: 'Falta correr course_withdrawal.sql: ' + wErr.message }, { status: 400 })

  // Recalcular Total Tuition: bajar list_price por tarifa × créditos
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, list_price, credit_rate').eq('student_id', b.student_id).eq('program_id', b.program_id)
    .order('list_price', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()

  let delta = 0, new_list_price: number | null = null
  const credits = g.credits != null ? Number(g.credits) : 0
  if (enr && enr.list_price != null && enr.credit_rate != null && credits > 0) {
    delta = Math.round(Number(enr.credit_rate) * credits * 100) / 100
    new_list_price = Math.max(0, Math.round((Number(enr.list_price) - delta) * 100) / 100)
    await sb.from('academic_student_enrollments').update({ list_price: new_list_price }).eq('id', enr.id)
  }

  return NextResponse.json({ ok: true, delta, new_list_price, credits })
}
