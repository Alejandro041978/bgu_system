import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { sameCourse } from '@/lib/course-match'
import { applyGradeEdit, type GradeChanges } from '@/lib/grades-write'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET ?q=...        → busca estudiantes por nombre o documento (lista distinta)
// GET ?document=... → devuelve las notas de ese estudiante
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const document = req.nextUrl.searchParams.get('document')
  const q = req.nextUrl.searchParams.get('q')?.trim()

  // Notas de un estudiante, con sus programas y cada nota etiquetada con el
  // programa al que pertenece. Las notas no traen programa: se resuelve
  // emparejando el nombre contra la malla (course-match), igual que egresados,
  // acta y retención. Quien cursa dos programas ve así sus notas separadas.
  if (document) {
    const sb = db()
    const { data, error } = await sb
      .from('academic_grades')
      .select('*')
      .eq('document_number', document)
      .order('term_year', { ascending: false })
      .order('term_block', { ascending: false })
      .order('course_code')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const grades = data ?? []

    let programs: { id: string; name: string }[] = []
    const { data: studs } = await sb.from('academic_students').select('id').eq('document_number', document)
    const studentIds = (studs ?? []).map((s: { id: string }) => s.id)
    if (studentIds.length) {
      const { data: enr } = await sb.from('academic_student_enrollments').select('student_id, program_id').in('student_id', studentIds)
      const programIds = [...new Set((enr ?? []).map((e: { program_id: string | null }) => e.program_id).filter(Boolean))] as string[]
      if (programIds.length) {
        const { data: progs } = await sb.from('academic_programs').select('id, name').in('id', programIds)
        programs = ((progs ?? []) as { id: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name))
        const { data: courses } = await sb.from('academic_courses').select('*').in('program_id', programIds)
        for (const g of grades as { course_code: string | null; course_name: string | null; program_ids?: string[] }[]) {
          g.program_ids = [...new Set(((courses ?? []) as { program_id: string; code: string | null; name: string | null }[])
            .filter(c =>
              (c.code && g.course_code && String(g.course_code) === String(c.code)) ||
              sameCourse(g.course_name, c.name))
            .map(c => c.program_id))]
        }
      }
    }

    return NextResponse.json({ grades, programs })
  }

  // Búsqueda de estudiantes
  if (q && q.length >= 2) {
    const { data, error } = await db()
      .from('academic_grades')
      .select('document_number, student_name')
      .or(`student_name.ilike.%${q}%,document_number.ilike.%${q}%`)
      .limit(300)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Distinct por documento
    const seen = new Map<string, string>()
    for (const r of data ?? []) {
      if (r.document_number && !seen.has(r.document_number)) seen.set(r.document_number, r.student_name)
    }
    const students = Array.from(seen.entries())
      .map(([document_number, student_name]) => ({ document_number, student_name }))
      .sort((a, b) => (a.student_name ?? '').localeCompare(b.student_name ?? ''))
      .slice(0, 50)
    return NextResponse.json({ students })
  }

  return NextResponse.json({ students: [] })
}

// PATCH { external_id, changes: { final_grade?, retake_grade?, course_name? }, reason }
// Edita una nota. Pasa por grades-write: auditoría + marca de edición (que la
// protege del sync) + recálculo inmediato del estudiante.
export async function PATCH(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { external_id?: string; changes?: GradeChanges; reason?: string } | null
  if (!body?.external_id || !body.changes) {
    return NextResponse.json({ error: 'Falta external_id o changes' }, { status: 400 })
  }
  const reason = (body.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'El motivo es obligatorio' }, { status: 400 })

  for (const k of ['final_grade', 'retake_grade'] as const) {
    const v = body.changes[k]
    if (v != null && (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100)) {
      return NextResponse.json({ error: `${k} debe ser un número entre 0 y 100` }, { status: 400 })
    }
  }

  const result = await applyGradeEdit(db(), {
    externalId: body.external_id, changes: body.changes, reason, userId: user.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.note ?? 'Error' }, { status: 500 })
  return NextResponse.json(result)
}
