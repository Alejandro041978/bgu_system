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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(sb: any, t: string, s: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from(t).select(s).range(f, f + 999)
    o.push(...(data ?? [])); if ((data ?? []).length < 1000) break
  }
  return o
}

// Créditos convalidados/validados por (estudiante, programa) — el ahorro TC
// se resta ANTES de calcular la beca (regla del usuario).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function transferCreditsMap(sb: any): Promise<Map<string, number>> {
  const [tcs, items] = await Promise.all([
    fetchAll(sb, 'transfer_credits', 'id, student_id, dest_program_id'),
    fetchAll(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id'),
  ])
  const courseIds = [...new Set(items.map(i => i.dest_course_id).filter(Boolean))] as string[]
  const creditsByCourse = new Map<string, number>()
  for (let i = 0; i < courseIds.length; i += 200) {
    const { data: cs } = await sb.from('academic_courses').select('id, credits').in('id', courseIds.slice(i, i + 200))
    for (const c of (cs ?? []) as { id: string; credits: number | null }[]) creditsByCourse.set(c.id, Number(c.credits ?? 0))
  }
  const tcInfo = new Map(tcs.map(t => [String(t.id), t]))
  const map = new Map<string, number>()
  for (const it of items) {
    const tc = tcInfo.get(String(it.transfer_credit_id))
    if (!tc?.student_id || !tc?.dest_program_id || !it.dest_course_id) continue
    const k = `${tc.student_id}|${tc.dest_program_id}`
    map.set(k, (map.get(k) ?? 0) + (creditsByCourse.get(String(it.dest_course_id)) ?? 0))
  }
  return map
}

// GET → becas otorgadas (activas y revocadas) con estudiante/programa/lista
// GET ?student=<id> → matrículas del estudiante (para el selector de programa)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()

  const studentId = req.nextUrl.searchParams.get('student')
  if (studentId) {
    const { data: enrs } = await sb.from('academic_student_enrollments')
      .select('id, program_id, list_price, credit_rate, program:academic_programs(name)')
      .eq('student_id', studentId)
    const ids = (enrs ?? []).map((e: { id: string }) => e.id)
    const conBeca = new Set<string>()
    if (ids.length) {
      const { data: act } = await sb.from('scholarships').select('enrollment_id').in('enrollment_id', ids).is('revoked_at', null)
      for (const a of (act ?? []) as { enrollment_id: string }[]) conBeca.add(a.enrollment_id)
    }
    const tcMap = await transferCreditsMap(sb)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ enrollments: ((enrs ?? []) as any[]).map(e => {
      const cr = tcMap.get(`${studentId}|${e.program_id}`) ?? 0
      const savings = e.credit_rate != null ? Math.round(cr * Number(e.credit_rate) * 100) / 100 : 0
      return {
        id: e.id, program_name: e.program?.name ?? 'Programa',
        list_price: e.list_price != null ? Number(e.list_price) : null,
        transfer_savings: savings,
        has_active: conBeca.has(e.id),
      }
    }) })
  }
  const { data: rows } = await sb.from('scholarships')
    .select('*, student:academic_students(first_name, last_name, second_last_name, document_number), program:academic_programs(name), enrollment:academic_student_enrollments(list_price, credit_rate)')
    .order('granted_at', { ascending: false }).order('created_at', { ascending: false })
  // El MONTO es derivado, nunca almacenado (regla del usuario): el ahorro por
  // Transfer Credit se resta PRIMERO y la beca es % × (lista − ahorro).
  // Total Tuition = lista − ahorro − beca.
  const tcMap = await transferCreditsMap(sb)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const becas = ((rows ?? []) as any[]).map(r => {
    const lista = r.enrollment?.list_price != null ? Number(r.enrollment.list_price) : null
    const rate = r.enrollment?.credit_rate != null ? Number(r.enrollment.credit_rate) : null
    const pct = Number(r.percentage)
    const cr = tcMap.get(`${r.student_id}|${r.program_id}`) ?? 0
    const savings = rate != null ? Math.round(cr * rate * 100) / 100 : 0
    const amount = lista != null ? Math.round(Math.max(0, lista - savings) * pct) / 100 : null
    return {
      id: r.id, enrollment_id: r.enrollment_id,
      student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
      document_number: r.student?.document_number ?? null,
      program_name: r.program?.name ?? null,
      percentage: pct,
      transfer_savings: savings,
      amount,
      list_price: lista,
      granted_at: r.granted_at, granted_by: r.granted_by, note: r.note,
      revoked_at: r.revoked_at,
    }
  })
  return NextResponse.json({ becas })
}

// POST { student_id, enrollment_id, percentage, note? } → otorga la beca.
// Solo se guarda el PORCENTAJE; el monto siempre se deriva de la base vigente.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const pct = Number(b?.percentage)
  if (!b?.student_id || !b?.enrollment_id) return NextResponse.json({ error: 'Faltan estudiante y matrícula' }, { status: 400 })
  if (!isFinite(pct) || pct <= 0 || pct > 100) return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 100' }, { status: 400 })

  const sb = db()
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, list_price, credit_rate').eq('id', b.enrollment_id).maybeSingle()
  if (!enr || enr.student_id !== b.student_id) return NextResponse.json({ error: 'Matrícula no encontrada para ese estudiante' }, { status: 404 })

  // Una beca activa por matrícula
  const { data: activa } = await sb.from('scholarships')
    .select('id, percentage').eq('enrollment_id', b.enrollment_id).is('revoked_at', null).maybeSingle()
  if (activa) {
    return NextResponse.json({ error: `Esta matrícula ya tiene una beca activa del ${activa.percentage}%. Revócala primero si corresponde reemplazarla.` }, { status: 409 })
  }

  const { error } = await sb.from('scholarships').insert({
    enrollment_id: enr.id, student_id: enr.student_id, program_id: enr.program_id,
    percentage: pct,
    granted_by: user.email ?? user.id, note: b?.note?.toString().trim() || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Monto informativo con la base de HOY (no se persiste): (lista − ahorro TC) × %
  let amount: number | null = null
  if (enr.list_price != null) {
    const tcMap = await transferCreditsMap(sb)
    const cr = tcMap.get(`${enr.student_id}|${enr.program_id}`) ?? 0
    const savings = enr.credit_rate != null ? Math.round(cr * Number(enr.credit_rate) * 100) / 100 : 0
    amount = Math.round(Math.max(0, Number(enr.list_price) - savings) * pct) / 100
  }
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
