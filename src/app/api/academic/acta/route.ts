import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const norm = (s: string | null) => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

// GET ?student_id=&program_id= → acta: malla del programa con estado por asignatura
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!studentId || !programId) return NextResponse.json({ error: 'Falta student_id o program_id' }, { status: 400 })

  const sb = db()

  const { data: student } = await sb.from('academic_students')
    .select('first_name, last_name, second_last_name, document_number').eq('id', studentId).maybeSingle()
  if (!student) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  const document = student.document_number

  const { data: program } = await sb.from('academic_programs').select('id, name, category_id').eq('id', programId).maybeSingle()
  let categoryPassing: number | null = null
  if (program?.category_id) {
    const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', program.category_id).maybeSingle()
    categoryPassing = cat?.passing_score ?? null
  }

  // Malla del programa
  const { data: courses } = await sb.from('academic_courses')
    .select('id, code, name, credits').eq('program_id', programId).order('code')

  // Notas reales del estudiante (excluye filas de convalidación y validación)
  const { data: grades } = document
    ? await sb.from('academic_grades').select('course_code, course_name, final_grade, retake_grade, passing_score')
        .eq('document_number', document).neq('source', 'convalidacion').neq('source', 'validacion')
    : { data: [] }

  // Convalidaciones/validaciones del estudiante para este programa (dest_course_id → { nota, tipo })
  const { data: tcs } = await sb.from('transfer_credits').select('id, kind').eq('student_id', studentId).eq('dest_program_id', programId)
  const kindByTc = new Map<string, string>()
  for (const t of tcs ?? []) kindByTc.set(t.id, t.kind === 'validacion' ? 'validacion' : 'convalidacion')
  const tcIds = (tcs ?? []).map((t: { id: string }) => t.id)
  const { data: tItems } = tcIds.length
    ? await sb.from('transfer_credit_items').select('transfer_credit_id, dest_course_id, converted_grade').in('transfer_credit_id', tcIds)
    : { data: [] }
  const transferMap = new Map<string, { grade: number | null; kind: string }>()
  for (const it of tItems ?? []) if (it.dest_course_id) {
    transferMap.set(it.dest_course_id, { grade: it.converted_grade, kind: kindByTc.get(it.transfer_credit_id) ?? 'convalidacion' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradeRows = (grades ?? []) as any[]
  const summary = { transfer: 0, validation: 0, aprobado: 0, desaprobado: 0, en_proceso: 0, pendiente: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (courses ?? []).map((c: any) => {
    // Transfer credit / Validation tienen prioridad (con o sin nota)
    if (transferMap.has(c.id)) {
      const tm = transferMap.get(c.id)!
      if (tm.kind === 'validacion') { summary.validation++; return { code: c.code, name: c.name, credits: c.credits, status: 'validation', grade: tm.grade } }
      summary.transfer++
      return { code: c.code, name: c.name, credits: c.credits, status: 'transfer', grade: tm.grade }
    }
    // Empareja notas por código o nombre
    const matches = gradeRows.filter(g =>
      (c.code && g.course_code && String(g.course_code) === String(c.code)) ||
      (norm(g.course_name) === norm(c.name) && norm(c.name) !== '')
    )
    const withValue = matches.map(g => ({ g, v: (g.retake_grade ?? g.final_grade) as number | null })).filter(x => x.v != null)
    if (withValue.length) {
      const best = withValue.reduce((a, b) => (Number(b.v) > Number(a.v) ? b : a))
      const passing = best.g.passing_score ?? categoryPassing
      const passed = passing != null ? Number(best.v) >= Number(passing) : true
      if (passed) { summary.aprobado++; return { code: c.code, name: c.name, credits: c.credits, status: 'aprobado', grade: best.v } }
      summary.desaprobado++; return { code: c.code, name: c.name, credits: c.credits, status: 'desaprobado', grade: best.v }
    }
    if (matches.length) { summary.en_proceso++; return { code: c.code, name: c.name, credits: c.credits, status: 'en_proceso', grade: null } }
    summary.pendiente++; return { code: c.code, name: c.name, credits: c.credits, status: 'pendiente', grade: null }
  })

  const studentName = [student.first_name, student.last_name, student.second_last_name].filter(Boolean).join(' ')
  return NextResponse.json({
    student: { name: studentName, document },
    program: { name: program?.name ?? '' },
    courses: rows,
    summary: { ...summary, total: rows.length },
  })
}
