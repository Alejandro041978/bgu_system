import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?convocatoria=<id> → ventas (matrículas) de la convocatoria con su
// asignación de asesora/tipo + catálogos (convocatorias, asesoras, tipos)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria')

  const [{ data: convocatorias }, { data: advisors }, { data: types }, { data: categories }] = await Promise.all([
    sb.from('convocatorias').select('id, name').order('name'),
    sb.from('hr_employees').select('id, full_name').order('full_name'),
    sb.from('admission_types').select('*').order('name'),
    sb.from('academic_programs_category').select('id, name, sigla').order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sales: any[] = []
  if (convocatoriaId) {
    const { data: enrs } = await sb.from('academic_student_enrollments')
      .select('id, enrollment_date, status, student:academic_students(id, first_name, last_name, second_last_name, document_number), program:academic_programs(id, name, category_id)')
      .eq('convocatoria_id', convocatoriaId).order('enrollment_date')
    const ids = (enrs ?? []).map((e: { id: string }) => e.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignments = new Map<string, any>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('admission_sales').select('*').in('enrollment_id', ids.slice(i, i + 200))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (data ?? []) as any[]) assignments.set(a.enrollment_id, a)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sales = (enrs ?? []).map((e: any) => ({
      enrollment_id: e.id,
      enrollment_date: e.enrollment_date,
      status: e.status,
      student_name: [e.student?.first_name, e.student?.last_name, e.student?.second_last_name].filter(Boolean).join(' '),
      document_number: e.student?.document_number ?? null,
      program_name: e.program?.name ?? null,
      category_id: e.program?.category_id ?? null,
      advisor_id: assignments.get(e.id)?.advisor_id ?? null,
      admission_type_id: assignments.get(e.id)?.admission_type_id ?? null,
      commission_amount: assignments.get(e.id)?.commission_amount ?? null,
    }))
  }

  return NextResponse.json({ convocatorias: convocatorias ?? [], advisors: advisors ?? [], types: types ?? [], categories: categories ?? [], sales })
}

// POST { enrollment_id, advisor_id?, admission_type_id? } → asigna la venta.
// La comisión se congela con el tipo elegido (snapshot del valor actual).
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.enrollment_id) return NextResponse.json({ error: 'Falta enrollment_id' }, { status: 400 })
  const sb = db()

  let commission: number | null = null
  if (b.admission_type_id) {
    const { data: t } = await sb.from('admission_types').select('commission').eq('id', b.admission_type_id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'Tipo de admisión no encontrado' }, { status: 404 })
    commission = Number(t.commission)
  }

  const { error } = await sb.from('admission_sales').upsert({
    enrollment_id: b.enrollment_id,
    advisor_id: b.advisor_id || null,
    admission_type_id: b.admission_type_id || null,
    commission_amount: commission,
    assigned_at: new Date().toISOString(),
    assigned_by: user.email ?? user.id,
  }, { onConflict: 'enrollment_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
