import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { creditosFacturablesEnBloque } from "@/lib/billable-credits"

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

// Créditos convalidados/validados por (estudiante, programa) — el ahorro TC se
// resta ANTES de la beca (regla del usuario). Igual que en Becas.
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

// Beca ACTIVA (porcentaje) por matrícula
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scholarshipPctByEnrollment(sb: any, enrIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  for (let i = 0; i < enrIds.length; i += 200) {
    const { data } = await sb.from('scholarships').select('enrollment_id, percentage')
      .in('enrollment_id', enrIds.slice(i, i + 200)).is('revoked_at', null)
    for (const s of (data ?? []) as { enrollment_id: string; percentage: number }[]) m.set(String(s.enrollment_id), Number(s.percentage))
  }
  return m
}

// afterBeca = lista − ahorroTC − beca ; bono = afterBeca × pct
function afterBeca(lista: number | null, savings: number, becaPct: number): number | null {
  if (lista == null) return null
  const becaBase = Math.max(0, lista - savings)
  const beca = Math.round(becaBase * becaPct) / 100
  return Math.round((lista - savings - beca) * 100) / 100
}

// GET → bonos otorgados con estudiante/programa/base/monto
// GET ?student=<id> → matrículas del estudiante (para el selector de programa)
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
    // Precio oficial calculado, igual que el estado de cuenta (no el snapshot).
    const fact = await creditosFacturablesEnBloque(sb, ids)
    for (const e of (enrs ?? []) as { id: string; list_price: number | null }[]) e.list_price = fact.get(String(e.id))?.lista ?? e.list_price
    const conBono = new Set<string>()
    if (ids.length) {
      const { data: act } = await sb.from('bonuses').select('enrollment_id').in('enrollment_id', ids)
      for (const a of (act ?? []) as { enrollment_id: string }[]) conBono.add(String(a.enrollment_id))
    }
    const tcMap = await transferCreditsMap(sb)
    const becaMap = await scholarshipPctByEnrollment(sb, ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ enrollments: ((enrs ?? []) as any[]).map(e => {
      const cr = tcMap.get(`${studentId}|${e.program_id}`) ?? 0
      const savings = e.credit_rate != null ? Math.round(cr * Number(e.credit_rate) * 100) / 100 : 0
      const becaPct = becaMap.get(String(e.id)) ?? 0
      const lista = e.list_price != null ? Number(e.list_price) : null
      return {
        id: e.id, program_name: e.program?.name ?? 'Programa',
        list_price: lista, transfer_savings: savings, scholarship_pct: becaPct,
        after_beca: afterBeca(lista, savings, becaPct),
        has_active: conBono.has(String(e.id)),
      }
    }) })
  }

  // Sin joins embebidos (bonuses puede no tener FKs): lecturas planas + lookups.
  const rows = await fetchAll(sb, 'bonuses', '*')
  rows.sort((a, b) => String(b.granted_at).localeCompare(String(a.granted_at)) || String(b.created_at).localeCompare(String(a.created_at)))

  const stuIds = [...new Set(rows.map(r => String(r.student_id)))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stuById = new Map<string, any>()
  for (let i = 0; i < stuIds.length; i += 200) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').in('id', stuIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) stuById.set(String(s.id), s)
  }
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
  const factTodo = await creditosFacturablesEnBloque(sb, enrIds)
  for (const [id, e] of enrById) e.list_price = factTodo.get(id)?.lista ?? e.list_price
  const tcMap = await transferCreditsMap(sb)
  const becaMap = await scholarshipPctByEnrollment(sb, enrIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bonos = (rows as any[]).map(r => {
    const enr = enrById.get(String(r.enrollment_id))
    const stu = stuById.get(String(r.student_id))
    const lista = enr?.list_price != null ? Number(enr.list_price) : null
    const rate = enr?.credit_rate != null ? Number(enr.credit_rate) : null
    const pct = Number(r.percentage)
    const cr = tcMap.get(`${r.student_id}|${r.program_id}`) ?? 0
    const savings = rate != null ? Math.round(cr * rate * 100) / 100 : 0
    const becaPct = becaMap.get(String(r.enrollment_id)) ?? 0
    const base = afterBeca(lista, savings, becaPct)
    const amount = base != null ? Math.round(base * pct) / 100 : null
    return {
      id: r.id, enrollment_id: r.enrollment_id,
      student_name: [stu?.first_name, stu?.last_name, stu?.second_last_name].filter(Boolean).join(' '),
      document_number: stu?.document_number ?? null,
      program_name: progName.get(String(r.program_id)) ?? null,
      percentage: pct, scholarship_pct: becaPct,
      base_after_beca: base, amount,
      total_tuition: base != null && amount != null ? Math.max(0, Math.round((base - amount) * 100) / 100) : null,
      reason: r.reason, granted_at: r.granted_at, granted_by: r.granted_by,
    }
  })
  return NextResponse.json({ bonos })
}

// POST { student_id, enrollment_id, percentage, reason } → otorga el bono.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const pct = Number(b?.percentage)
  if (!b?.student_id || !b?.enrollment_id) return NextResponse.json({ error: 'Faltan estudiante y matrícula' }, { status: 400 })
  if (!isFinite(pct) || pct <= 0 || pct > 100) return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 100' }, { status: 400 })
  const reason = b?.reason?.toString().trim()
  if (!reason) return NextResponse.json({ error: 'Debes ingresar el motivo del bono' }, { status: 400 })

  const sb = db()
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id').eq('id', b.enrollment_id).maybeSingle()
  if (!enr || enr.student_id !== b.student_id) return NextResponse.json({ error: 'Matrícula no encontrada para ese estudiante' }, { status: 404 })

  const { data: existe } = await sb.from('bonuses').select('id, percentage').eq('enrollment_id', b.enrollment_id).maybeSingle()
  if (existe) return NextResponse.json({ error: `Esta matrícula ya tiene un bono del ${existe.percentage}%. Edítalo o elimínalo.` }, { status: 409 })

  const { error } = await sb.from('bonuses').insert({
    enrollment_id: enr.id, student_id: enr.student_id, program_id: enr.program_id,
    percentage: pct, reason, granted_by: user.email ?? user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { id, percentage?, reason? } → edita el bono
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.percentage !== undefined) {
    const pct = Number(b.percentage)
    if (!isFinite(pct) || pct <= 0 || pct > 100) return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 100' }, { status: 400 })
    patch.percentage = pct
  }
  if (b.reason !== undefined) {
    const reason = b.reason?.toString().trim()
    if (!reason) return NextResponse.json({ error: 'El motivo no puede quedar vacío' }, { status: 400 })
    patch.reason = reason
  }
  const { error } = await db().from('bonuses').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → elimina el bono
export async function DELETE(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await db().from('bonuses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
