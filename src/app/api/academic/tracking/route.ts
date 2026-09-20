import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { runStudentTracking } from '@/lib/student-tracking'
import { guardStaff } from '@/lib/api-guard'
import { overdueByStudent } from '@/lib/moodle-access'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?risk= → filas de seguimiento + resumen por nivel
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const risk = req.nextUrl.searchParams.get('risk')

  const situation = req.nextUrl.searchParams.get('situation')

  const category = req.nextUrl.searchParams.get('category')
  const debt = req.nextUrl.searchParams.get('debt')   // 'con' | 'sin' (deuda VENCIDA)

  // TODO el seguimiento, paginado. PostgREST corta en 1000 filas aunque se pida
  // limit(2000): la lista, los contadores de riesgo y los de situación salían
  // de consultas truncadas y por eso todo sumaba exactamente 1000 (19/09/2026).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data: page, error } = await sb.from('student_tracking')
      .select('student_id, balance, last_erp_login, last_moodle_access, inactivity_days, risk_level, updated_at, student:academic_students(first_name, last_name, second_last_name, phone_number, email, document_number, situation, situation_source)')
      .order('student_id').range(f, f + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    data.push(...(page ?? []))
    if ((page ?? []).length < 1000) break
  }

  // Categorías de programa de cada estudiante (por sus matrículas de programa)
  const [{ data: cats }, { data: progs }] = await Promise.all([
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('academic_programs').select('id, category_id'),
  ])
  const catDeProg = new Map<string, string | null>(((progs ?? []) as { id: string; category_id: string | null }[]).map(p => [String(p.id), p.category_id ? String(p.category_id) : null]))
  const catsDe = new Map<string, Set<string>>()
  for (let f = 0; ; f += 1000) {
    const { data: page } = await sb.from('academic_student_enrollments').select('id, student_id, program_id').order('id').range(f, f + 999)
    for (const e of (page ?? []) as { student_id: string; program_id: string | null }[]) {
      const c = e.program_id ? catDeProg.get(String(e.program_id)) : null
      if (!c) continue
      if (!catsDe.has(String(e.student_id))) catsDe.set(String(e.student_id), new Set())
      catsDe.get(String(e.student_id))!.add(c)
    }
    if ((page ?? []).length < 1000) break
  }

  // Deuda VENCIDA oficial (tuition, cuota por cuota): la misma que restringe el
  // campus, mueve a Cobranza y cuenta para el IW automático. La columna "Deuda"
  // de esta pantalla es el SALDO (incluye cuotas futuras): casi todo matriculado
  // con plan vigente lo tiene, así que el filtro con/sin deuda usa la vencida.
  const vencida = await overdueByStudent(sb)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let base = data.map((r: any) => ({
    overdue: Math.round((vencida.get(String(r.student_id)) ?? 0) * 100) / 100,
    student_id: r.student_id, balance: r.balance, last_erp_login: r.last_erp_login,
    last_moodle_access: r.last_moodle_access, inactivity_days: r.inactivity_days, risk_level: r.risk_level,
    updated_at: r.updated_at,
    name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    phone: r.student?.phone_number ?? null, email: r.student?.email ?? null, document_number: r.student?.document_number ?? null,
    situation: r.student?.situation ?? 'activo', situation_source: r.student?.situation_source ?? 'auto',
  }))
  // Filtro por categoría de programa: basta con que UNA de sus matrículas sea de esa categoría
  if (category) base = base.filter(r => catsDe.get(String(r.student_id))?.has(category))

  // Con / sin deuda vencida: contadores antes de aplicar ese mismo filtro
  const deuda = { con: base.filter(r => r.overdue > 0.005).length, sin: base.filter(r => r.overdue <= 0.005).length }
  if (debt === 'con') base = base.filter(r => r.overdue > 0.005)
  else if (debt === 'sin') base = base.filter(r => r.overdue <= 0.005)

  // Contadores sobre la base (con la categoría aplicada, sin riesgo ni situación)
  const counts: Record<string, number> = {}
  const situations: Record<string, number> = {}
  for (const r of base) {
    counts[r.risk_level] = (counts[r.risk_level] ?? 0) + 1
    situations[r.situation] = (situations[r.situation] ?? 0) + 1
  }

  // Umbrales largos de inactividad (19/09/2026): más de 30, 60 y 90 días. Son
  // ACUMULATIVOS y subconjuntos de "≥14 días" (quien lleva 95 días cuenta en los
  // tres), por eso van aparte de counts, que reparte a cada estudiante en un
  // solo nivel y cuya suma es el total.
  const UMBRALES: Record<string, number> = { d30: 30, d60: 60, d90: 90 }
  const umbrales: Record<string, number> = {}
  for (const [k, n] of Object.entries(UMBRALES)) umbrales[k] = base.filter(r => r.inactivity_days != null && Number(r.inactivity_days) > n).length

  let rows = !risk ? base
    : UMBRALES[risk] != null ? base.filter(r => r.inactivity_days != null && Number(r.inactivity_days) > UMBRALES[risk])
      : base.filter(r => r.risk_level === risk)
  // Filtro por situación: 'activo' es el default; los demás son "excluidos de campaña"
  if (situation === 'activo') rows = rows.filter(r => r.situation === 'activo')
  else if (situation === 'excluidos') rows = rows.filter(r => r.situation !== 'activo')
  else if (situation) rows = rows.filter(r => r.situation === situation)
  // Mismo orden de antes: sin dato primero, luego los más inactivos
  rows.sort((x, y) => (x.inactivity_days == null ? -1 : y.inactivity_days == null ? 1 : Number(y.inactivity_days) - Number(x.inactivity_days)))

  const { data: last } = await sb.from('student_tracking').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({ rows, counts, umbrales, deuda, situations, categories: cats ?? [], last_updated: last?.updated_at ?? null })
}

// PATCH → etiquetar manualmente la situación de un estudiante (source = 'manual')
const VALID_SITUATIONS = ['activo', 'egresado', 'retiro_permanente', 'retiro_temporal', 'campus_socio']
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null) as { student_id?: string; situation?: string } | null
  if (!body?.student_id || !body?.situation || !VALID_SITUATIONS.includes(body.situation)) {
    return NextResponse.json({ error: 'student_id y situation válidos requeridos' }, { status: 400 })
  }
  const sb = db()
  // Al volver a 'activo' liberamos el override (source vuelve a 'auto' para que el
  // sync de retiros pueda gestionarlo de nuevo); cualquier otra es override manual.
  const patch = body.situation === 'activo'
    ? { situation: 'activo', situation_source: 'auto', withdrawal_date: null, withdrawal_resolution: null }
    : { situation: body.situation, situation_source: 'manual' }
  const { error } = await sb.from('academic_students').update(patch).eq('id', body.student_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST → recalcula ahora (usuario autenticado)
export async function POST() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const r = await runStudentTracking()
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
