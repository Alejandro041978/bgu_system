import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reporte de Egresados: quienes completaron su programa (student_graduations),
// con filtro por categoría y programa. status: pendiente = egresado sin
// título emitido; titulado = con título.
// GET ?category_id=&program_id=&status=
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const categoryId = req.nextUrl.searchParams.get('category_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  const status = req.nextUrl.searchParams.get('status')
  const sb = db()

  const [{ data: cats }, { data: progs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name, sigla').order('name'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grads: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('student_graduations')
      .select('id, student_id, program_id, detected_at, titulacion_status, titulado_at, courses_total, courses_covered')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    grads.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progOf = new Map<string, any>(((progs ?? []) as any[]).map(p => [p.id, p]))
  let rows = grads.filter(g => {
    const p = progOf.get(g.program_id)
    if (!p) return false
    if (programId && g.program_id !== programId) return false
    if (categoryId && p.category_id !== categoryId) return false
    if (status && (g.titulacion_status ?? 'pendiente') !== status) return false
    return true
  })

  const studentIds = [...new Set(rows.map(g => g.student_id).filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = new Map<string, any>()
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, email_alt')
      .in('id', studentIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) students.set(s.id, s)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catName = new Map<string, string>(((cats ?? []) as any[]).map(c => [c.id, c.name]))
  const out = rows.map(g => {
    const s = students.get(g.student_id)
    const p = progOf.get(g.program_id)
    return {
      id: g.id,
      name: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '(desconocido)',
      document: s ? String(s.document_number ?? '') : '',
      email: s?.email_alt ?? s?.email ?? null,
      program: p?.name ?? '',
      category: catName.get(p?.category_id) ?? '',
      status: g.titulacion_status ?? 'pendiente',
      egreso: g.detected_at,
      titulado_at: g.titulado_at,
      avance: `${g.courses_covered ?? '—'}/${g.courses_total ?? '—'}`,
    }
  }).sort((a, b) => String(b.egreso ?? '').localeCompare(String(a.egreso ?? '')) || a.name.localeCompare(b.name))

  return NextResponse.json({
    categories: cats ?? [],
    programs: progs ?? [],
    resumen: {
      total: out.length,
      egresados: out.filter(r => r.status !== 'titulado').length,
      titulados: out.filter(r => r.status === 'titulado').length,
    },
    rows: out,
  })
}
