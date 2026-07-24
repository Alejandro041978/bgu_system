import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(sb: any, t: string, s: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(t).select(s).range(f, f + 999)
    if (error) throw new Error(t + ': ' + error.message)
    o.push(...(data ?? [])); if ((data ?? []).length < 1000) break
  }
  return o
}

// ---------------------------------------------------------------------------
// Auditoría de Tuition (regla del usuario, 2026-07-23):
//   Total Tuition esperado = precio oficial − Transfer Credit Savings − beca
//   debe COINCIDIR con la suma de las cuotas de concepto Tuition facturadas.
// Los que no coinciden se reportan con link directo a su estado de cuenta.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const categoryFilter = req.nextUrl.searchParams.get('category')

  const [cats, progs, enrs, students, concepts, scholarships, tcs, tcItems] = await Promise.all([
    fetchAll(sb, 'academic_programs_category', 'id, name, sigla'),
    fetchAll(sb, 'academic_programs', 'id, name, category_id'),
    fetchAll(sb, 'academic_student_enrollments', 'id, student_id, program_id, list_price, credit_rate'),
    fetchAll(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number'),
    fetchAll(sb, 'account_concepts', 'type_code, abbr, name'),
    fetchAll(sb, 'scholarships', 'enrollment_id, percentage, revoked_at'),
    fetchAll(sb, 'transfer_credits', 'id, student_id, dest_program_id'),
    fetchAll(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id'),
  ])

  // Conceptos Tuition (por nombre/abreviatura)
  const tuitionTypes = new Set(concepts
    .filter(c => /tuition/i.test(String(c.abbr ?? '')) || /tuition/i.test(String(c.name ?? '')))
    .map(c => Number(c.type_code)))

  // Cuotas Tuition por matrícula
  const charges = await fetchAll(sb, 'account_charges', 'enrollment_id, amount, charge_type')
  const tuitionByEnr = new Map<string, number>()
  for (const c of charges) {
    if (!c.enrollment_id || !tuitionTypes.has(Number(c.charge_type))) continue
    tuitionByEnr.set(String(c.enrollment_id), (tuitionByEnr.get(String(c.enrollment_id)) ?? 0) + Number(c.amount ?? 0))
  }

  // Créditos convalidados por (student, program)
  const courseIds = [...new Set(tcItems.map(i => i.dest_course_id).filter(Boolean))] as string[]
  const creditsByCourse = new Map<string, number>()
  for (let i = 0; i < courseIds.length; i += 200) {
    const { data: cs } = await sb.from('academic_courses').select('id, credits').in('id', courseIds.slice(i, i + 200))
    for (const c of (cs ?? []) as { id: string; credits: number | null }[]) creditsByCourse.set(c.id, Number(c.credits ?? 0))
  }
  const tcInfo = new Map(tcs.map(t => [String(t.id), t]))
  const tcCredits = new Map<string, number>()
  for (const it of tcItems) {
    const tc = tcInfo.get(String(it.transfer_credit_id))
    if (!tc?.student_id || !tc?.dest_program_id || !it.dest_course_id) continue
    const k = `${tc.student_id}|${tc.dest_program_id}`
    tcCredits.set(k, (tcCredits.get(k) ?? 0) + (creditsByCourse.get(String(it.dest_course_id)) ?? 0))
  }

  const pctByEnr = new Map<string, number>()
  for (const s of scholarships) if (!s.revoked_at) pctByEnr.set(String(s.enrollment_id), Number(s.percentage))

  const stuById = new Map(students.map(s => [String(s.id), s]))
  const progById = new Map(progs.map(p => [String(p.id), p]))
  const catById = new Map(cats.map(c => [String(c.id), c]))
  const r2 = (n: number) => Math.round(n * 100) / 100

  const mismatches = []
  let auditadas = 0
  for (const e of enrs) {
    if (e.list_price == null) continue
    const prog = progById.get(String(e.program_id))
    if (categoryFilter && String(prog?.category_id) !== categoryFilter) continue
    auditadas++

    const lista = Number(e.list_price)
    const cr = tcCredits.get(`${e.student_id}|${e.program_id}`) ?? 0
    const savings = e.credit_rate != null ? r2(cr * Number(e.credit_rate)) : 0
    const pct = pctByEnr.get(String(e.id)) ?? 0
    const beca = r2(Math.max(0, lista - savings) * pct / 100)
    const esperado = r2(lista - savings - beca)
    const facturado = r2(tuitionByEnr.get(String(e.id)) ?? 0)
    const diff = r2(facturado - esperado)
    if (Math.abs(diff) <= 0.5) continue

    const stu = stuById.get(String(e.student_id))
    mismatches.push({
      student_id: e.student_id,
      student_name: [stu?.first_name, stu?.last_name, stu?.second_last_name].filter(Boolean).join(' '),
      document_number: stu?.document_number ?? null,
      program_name: prog?.name ?? null,
      category_id: prog?.category_id ?? null,
      sigla: catById.get(String(prog?.category_id))?.sigla ?? null,
      list_price: lista, transfer_savings: savings, scholarship_pct: pct || null, beca,
      expected_tuition: esperado, billed_tuition: facturado, diff,
    })
  }
  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  return NextResponse.json({
    categories: cats,
    auditadas,
    coinciden: auditadas - mismatches.length,
    mismatches,
  })
}
