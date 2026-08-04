import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'

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

// Detalle de una beca (fila) → estudiante/programa/lista/ahorro/monto derivado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBeca(r: any, stu: any, progName: Map<string, string>, enr: any, tcMap: Map<string, number>) {
  const lista = enr?.list_price != null ? Number(enr.list_price) : null
  const rate = enr?.credit_rate != null ? Number(enr.credit_rate) : null
  const pct = Number(r.percentage)
  const cr = tcMap.get(`${r.student_id}|${r.program_id}`) ?? 0
  const savings = rate != null ? Math.round(cr * rate * 100) / 100 : 0
  const amount = lista != null ? Math.round(Math.max(0, lista - savings) * pct) / 100 : null
  return {
    id: r.id, enrollment_id: r.enrollment_id,
    student_name: [stu?.first_name, stu?.last_name, stu?.second_last_name].filter(Boolean).join(' '),
    document_number: stu?.document_number ?? null,
    program_name: progName.get(String(r.program_id)) ?? null,
    percentage: pct, transfer_savings: savings, amount, list_price: lista,
    granted_at: r.granted_at, granted_by: r.granted_by, note: r.note, revoked_at: r.revoked_at,
  }
}

// GET → RESUMEN por programa (cantidad + monto becado), NO todas las becas
//        (la lista completa colgaba el navegador con miles de filas).
// GET ?student=<id> → matrículas del estudiante (selector) + SUS becas
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

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
    const enrollments = ((enrs ?? []) as any[]).map(e => {
      const cr = tcMap.get(`${studentId}|${e.program_id}`) ?? 0
      const savings = e.credit_rate != null ? Math.round(cr * Number(e.credit_rate) * 100) / 100 : 0
      return {
        id: e.id, program_name: e.program?.name ?? 'Programa',
        list_price: e.list_price != null ? Number(e.list_price) : null,
        transfer_savings: savings, has_active: conBeca.has(e.id),
      }
    })
    // Becas del estudiante (activas y revocadas)
    const { data: becaRows } = await sb.from('scholarships').select('*').eq('student_id', studentId)
    const { data: stu } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').eq('id', studentId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrById = new Map<string, any>(((enrs ?? []) as any[]).map(e => [String(e.id), e]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progName = new Map<string, string>(((enrs ?? []) as any[]).map(e => [String(e.program_id), e.program?.name ?? 'Programa']))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const becas = ((becaRows ?? []) as any[])
      .sort((a, b) => String(b.granted_at).localeCompare(String(a.granted_at)))
      .map(r => mapBeca(r, stu, progName, enrById.get(String(r.enrollment_id)), tcMap))
    return NextResponse.json({ enrollments, becas })
  }

  // RESUMEN por programa (solo becas ACTIVAS). Se calcula el monto server-side
  // y se agrega — el cliente recibe ~pocas filas, no miles.
  const rows = (await fetchAll(sb, 'scholarships', 'id, student_id, program_id, enrollment_id, percentage, revoked_at'))
    .filter(r => !r.revoked_at)
  const progIds = [...new Set(rows.map(r => String(r.program_id)).filter(x => x !== 'null'))]
  const progName = new Map<string, string>()
  for (let i = 0; i < progIds.length; i += 200) {
    const { data } = await sb.from('academic_programs').select('id, name').in('id', progIds.slice(i, i + 200))
    for (const p of (data ?? []) as { id: string; name: string }[]) progName.set(String(p.id), p.name)
  }
  const enrIds = [...new Set(rows.map(r => String(r.enrollment_id)))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrById = new Map<string, any>()
  for (let i = 0; i < enrIds.length; i += 200) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('id, list_price, credit_rate').in('id', enrIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (data ?? []) as any[]) enrById.set(String(e.id), e)
  }
  const tcMap = await transferCreditsMap(sb)

  const byProg = new Map<string, { program_name: string; count: number; total_amount: number; sin_monto: number }>()
  let total_count = 0, total_amount = 0
  for (const r of rows) {
    const enr = enrById.get(String(r.enrollment_id))
    const lista = enr?.list_price != null ? Number(enr.list_price) : null
    const rate = enr?.credit_rate != null ? Number(enr.credit_rate) : null
    const cr = tcMap.get(`${r.student_id}|${r.program_id}`) ?? 0
    const savings = rate != null ? Math.round(cr * rate * 100) / 100 : 0
    const amount = lista != null ? Math.round(Math.max(0, lista - savings) * Number(r.percentage)) / 100 : null
    const key = String(r.program_id)
    const g = byProg.get(key) ?? { program_name: progName.get(key) ?? '—', count: 0, total_amount: 0, sin_monto: 0 }
    g.count++
    if (amount != null) g.total_amount += amount; else g.sin_monto++
    byProg.set(key, g)
    total_count++
    total_amount += amount ?? 0
  }
  const summary = [...byProg.values()].sort((a, b) => b.total_amount - a.total_amount)
  return NextResponse.json({ summary, total_count, total_amount: Math.round(total_amount * 100) / 100 })
}

// POST { student_id, enrollment_id, percentage, note? } → otorga la beca.
// Solo se guarda el PORCENTAJE; el monto siempre se deriva de la base vigente.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

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
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

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
