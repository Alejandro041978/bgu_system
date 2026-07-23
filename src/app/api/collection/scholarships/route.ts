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

// GET → becas otorgadas (activas y revocadas) con estudiante/programa/lista
// GET ?student=<id> → matrículas del estudiante (para el selector de programa)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()

  const studentId = req.nextUrl.searchParams.get('student')
  if (studentId) {
    const { data: enrs } = await sb.from('academic_student_enrollments')
      .select('id, list_price, credit_rate, program:academic_programs(name)')
      .eq('student_id', studentId)
    const ids = (enrs ?? []).map((e: { id: string }) => e.id)
    const conBeca = new Set<string>()
    if (ids.length) {
      const { data: act } = await sb.from('scholarships').select('enrollment_id').in('enrollment_id', ids).is('revoked_at', null)
      for (const a of (act ?? []) as { enrollment_id: string }[]) conBeca.add(a.enrollment_id)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ enrollments: ((enrs ?? []) as any[]).map(e => ({
      id: e.id, program_name: e.program?.name ?? 'Programa',
      list_price: e.list_price != null ? Number(e.list_price) : null,
      has_active: conBeca.has(e.id),
    })) })
  }
  const { data: rows } = await sb.from('scholarships')
    .select('*, student:academic_students(first_name, last_name, second_last_name, document_number), program:academic_programs(name), enrollment:academic_student_enrollments(list_price, credit_rate)')
    .order('granted_at', { ascending: false }).order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const becas = ((rows ?? []) as any[]).map(r => ({
    id: r.id, enrollment_id: r.enrollment_id,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
    program_name: r.program?.name ?? null,
    percentage: Number(r.percentage), amount: r.amount != null ? Number(r.amount) : null,
    list_price: r.enrollment?.list_price != null ? Number(r.enrollment.list_price) : null,
    granted_at: r.granted_at, granted_by: r.granted_by, note: r.note,
    revoked_at: r.revoked_at,
  }))
  return NextResponse.json({ becas })
}

// POST { student_id, enrollment_id, percentage, note? } → otorga la beca.
// El monto se congela: precio de lista de la matrícula × porcentaje.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const pct = Number(b?.percentage)
  if (!b?.student_id || !b?.enrollment_id) return NextResponse.json({ error: 'Faltan estudiante y matrícula' }, { status: 400 })
  if (!isFinite(pct) || pct <= 0 || pct > 100) return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 100' }, { status: 400 })

  const sb = db()
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, list_price').eq('id', b.enrollment_id).maybeSingle()
  if (!enr || enr.student_id !== b.student_id) return NextResponse.json({ error: 'Matrícula no encontrada para ese estudiante' }, { status: 404 })

  // Una beca activa por matrícula
  const { data: activa } = await sb.from('scholarships')
    .select('id, percentage').eq('enrollment_id', b.enrollment_id).is('revoked_at', null).maybeSingle()
  if (activa) {
    return NextResponse.json({ error: `Esta matrícula ya tiene una beca activa del ${activa.percentage}%. Revócala primero si corresponde reemplazarla.` }, { status: 409 })
  }

  const amount = enr.list_price != null ? Math.round(Number(enr.list_price) * pct) / 100 : null
  const { error } = await sb.from('scholarships').insert({
    enrollment_id: enr.id, student_id: enr.student_id, program_id: enr.program_id,
    percentage: pct, amount,
    granted_by: user.email ?? user.id, note: b?.note?.toString().trim() || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, amount })
}

// PATCH { id, action: 'revoke' } → revoca (queda el rastro)
export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id || b?.action !== 'revoke') return NextResponse.json({ error: 'Falta id o action' }, { status: 400 })
  const { error } = await db().from('scholarships')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.email ?? user.id })
    .eq('id', b.id).is('revoked_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
