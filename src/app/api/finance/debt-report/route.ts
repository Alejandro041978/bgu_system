import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(sb: any, table: string, select: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Reporte de Deuda (regla del usuario, 2026-07-23).
// Mes de consulta M: cada CUOTA se clasifica por su VENCIMIENTO (due_date) en
// Pasado (< M), Actual (= M) o Futuro (> M); cada PAGO igual pero por su
// FECHA DE PAGO (paid_date). Por categoría (sigla):
//   deuda vencida    = cuotas pasado + cuotas actual − pagos pasado − pagos actual
//   deuda por vencer = cuotas futuro − pagos futuro
//   deudores         = estudiantes con deuda vencida o por vencer > 0
// KPIs: morosidad = vencida / (vencida + por vencer);
//       recaudación = pagos actual / (cuotas pasado + cuotas actual).
// Cuotas sin fecha de vencimiento se tratan como YA EXIGIBLES (pasado).
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })

  const sb = db()

  const [cats, progs, enrs, charges, payments] = await Promise.all([
    fetchAll(sb, 'academic_programs_category', 'id, name, sigla'),
    fetchAll(sb, 'academic_programs', 'id, category_id'),
    fetchAll(sb, 'academic_student_enrollments', 'id, student_id, program_id'),
    fetchAll(sb, 'account_charges', 'external_id, student_id, enrollment_id, amount, due_date'),
    fetchAll(sb, 'account_payments', 'charge_external_id, student_id, amount, paid_date'),
  ])

  const catById = new Map(cats.map(c => [String(c.id), c]))
  const progCat = new Map(progs.map(p => [String(p.id), p.category_id ? String(p.category_id) : null]))
  const enrById = new Map(enrs.map(e => [String(e.id), e]))
  // Fallback: categoría por estudiante (su primera matrícula) para cargos sin
  // enrollment y pagos sin cargo asociado
  const studentCat = new Map<string, string>()
  for (const e of enrs) {
    const cid = progCat.get(String(e.program_id))
    if (cid && !studentCat.has(String(e.student_id))) studentCat.set(String(e.student_id), cid)
  }

  const catOfCharge = (ch: { enrollment_id: string | null; student_id: string | null }): string => {
    if (ch.enrollment_id) {
      const e = enrById.get(String(ch.enrollment_id))
      const cid = e ? progCat.get(String(e.program_id)) : null
      if (cid) return cid
    }
    return (ch.student_id && studentCat.get(String(ch.student_id))) || 'SIN'
  }

  // pasado | actual | futuro respecto del mes de consulta
  const bucket = (date: string | null): 'past' | 'act' | 'fut' => {
    if (!date) return 'past'                      // sin vencimiento = ya exigible
    const m = String(date).slice(0, 7)
    return m < month ? 'past' : m > month ? 'fut' : 'act'
  }

  type Row = {
    c_past: number; c_act: number; c_fut: number
    p_past: number; p_act: number; p_fut: number
    students: Map<string, { c_past: number; c_act: number; c_fut: number; p_past: number; p_act: number; p_fut: number }>
  }
  const rows = new Map<string, Row>()
  const rowOf = (cid: string): Row => {
    if (!rows.has(cid)) rows.set(cid, { c_past: 0, c_act: 0, c_fut: 0, p_past: 0, p_act: 0, p_fut: 0, students: new Map() })
    return rows.get(cid)!
  }
  const stuOf = (r: Row, sid: string) => {
    if (!r.students.has(sid)) r.students.set(sid, { c_past: 0, c_act: 0, c_fut: 0, p_past: 0, p_act: 0, p_fut: 0 })
    return r.students.get(sid)!
  }

  const chargeCat = new Map<string, string>()   // external_id → categoría (para pagos)
  for (const ch of charges) {
    const cid = catOfCharge(ch)
    if (ch.external_id) chargeCat.set(String(ch.external_id), cid)
    const amt = Number(ch.amount) || 0
    const b = bucket(ch.due_date)
    const r = rowOf(cid)
    r[`c_${b}`] += amt
    if (ch.student_id) stuOf(r, String(ch.student_id))[`c_${b}`] += amt
  }

  for (const p of payments) {
    const cid = (p.charge_external_id && chargeCat.get(String(p.charge_external_id)))
      || (p.student_id && studentCat.get(String(p.student_id))) || 'SIN'
    const amt = Number(p.amount) || 0
    const b = bucket(p.paid_date)
    const r = rowOf(cid)
    r[`p_${b}`] += amt
    if (p.student_id) stuOf(r, String(p.student_id))[`p_${b}`] += amt
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const globalDebtors = new Set<string>()
  const table = [...rows.entries()].map(([cid, r]) => {
    const cat = catById.get(cid)
    const vencida = r.c_past + r.c_act - r.p_past - r.p_act
    const porVencer = r.c_fut - r.p_fut
    let deudores = 0
    for (const [sid, s] of r.students) {
      const v = s.c_past + s.c_act - s.p_past - s.p_act
      const pv = s.c_fut - s.p_fut
      if (v > 0.005 || pv > 0.005) { deudores++; globalDebtors.add(sid) }
    }
    return {
      categoria_id: cid,
      sigla: cat?.sigla ?? (cid === 'SIN' ? 'SIN' : (cat?.name ?? cid).split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 6)),
      nombre: cat?.name ?? (cid === 'SIN' ? 'Sin categoría' : cid),
      cuotas_pasado: r2(r.c_past), cuotas_actual: r2(r.c_act), cuotas_futuro: r2(r.c_fut),
      pagos_pasado: r2(r.p_past), pagos_actual: r2(r.p_act), pagos_futuro: r2(r.p_fut),
      deuda_vencida: r2(vencida), deuda_por_vencer: r2(porVencer),
      deudores,
    }
  }).sort((a, b) => a.sigla.localeCompare(b.sigla))

  const sum = (f: (t: typeof table[number]) => number) => r2(table.reduce((s, t) => s + f(t), 0))
  const tot = {
    cuotas_pasado: sum(t => t.cuotas_pasado), cuotas_actual: sum(t => t.cuotas_actual), cuotas_futuro: sum(t => t.cuotas_futuro),
    pagos_pasado: sum(t => t.pagos_pasado), pagos_actual: sum(t => t.pagos_actual), pagos_futuro: sum(t => t.pagos_futuro),
    deuda_vencida: sum(t => t.deuda_vencida), deuda_por_vencer: sum(t => t.deuda_por_vencer),
    deudores: globalDebtors.size,
  }
  const deudaTotal = tot.deuda_vencida + tot.deuda_por_vencer
  // Monto exigible del mes = deuda arrastrada (cuotas pasadas impagas) + lo
  // que vence este mes. Con cuotas brutas históricas el ratio se diluye a
  // nada (todo lo pagado desde 2023 inflaría el denominador).
  const exigible = (tot.cuotas_pasado - tot.pagos_pasado) + tot.cuotas_actual
  const kpis = {
    indice_morosidad: deudaTotal > 0 ? r2(tot.deuda_vencida / deudaTotal * 100) : null,
    tasa_recaudacion: exigible > 0 ? r2(tot.pagos_actual / exigible * 100) : null,
    deuda_vencida: tot.deuda_vencida,
    deuda_por_vencer: tot.deuda_por_vencer,
    deudores: tot.deudores,
  }

  return NextResponse.json({ month, kpis, table, totales: tot })
}
