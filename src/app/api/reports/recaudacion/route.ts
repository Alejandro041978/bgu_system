import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { fetchByIn } from '@/lib/grades-write'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reporte de recaudación: meses calendario × categorías de producto, sobre
// TODOS los pagos recibidos (account_payments, cualquier concepto).
// La categoría del pago se resuelve: cuota → matrícula → programa → categoría;
// con fallback a la convocatoria de la cuota y, en última instancia, al
// programa único del estudiante.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const yearParam = req.nextUrl.searchParams.get('year')

  // Años disponibles: del primer al último pago con fecha
  const [{ data: first }, { data: last }] = await Promise.all([
    sb.from('account_payments').select('paid_date').not('paid_date', 'is', null).order('paid_date', { ascending: true }).limit(1),
    sb.from('account_payments').select('paid_date').not('paid_date', 'is', null).order('paid_date', { ascending: false }).limit(1),
  ])
  const y0 = first?.[0]?.paid_date ? Number(String(first[0].paid_date).slice(0, 4)) : new Date().getFullYear()
  const y1 = last?.[0]?.paid_date ? Number(String(last[0].paid_date).slice(0, 4)) : new Date().getFullYear()
  const years: number[] = []
  for (let y = y1; y >= y0; y--) years.push(y)

  const year = Number(yearParam) || y1
  if (!yearParam) return NextResponse.json({ years, year })

  // Pagos del año (paginado; select * para tolerar columnas de analítica nuevas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pays: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('account_payments')
      .select('*')
      .gte('paid_date', `${year}-01-01`).lte('paid_date', `${year}-12-31`)
      .range(from, from + 999)
    const chunk = data ?? []
    pays.push(...chunk)
    if (chunk.length < 1000) break
  }

  // Catálogos chicos
  // select('*') en categorías para tolerar que la columna sigla exista o no
  const [{ data: cats }, { data: progs }, { data: convs }] = await Promise.all([
    sb.from('academic_programs_category').select('*').order('name'),
    sb.from('academic_programs').select('id, category_id'),
    sb.from('convocatorias').select('id, product_category_id'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catRows = (cats ?? []) as any[]
  const catName = new Map<string, string>(catRows.map(c => [c.id, c.name]))
  const catSigla = new Map<string, string>(catRows.filter(c => c.sigla).map(c => [c.name, c.sigla]))
  const progCat = new Map(((progs ?? []) as { id: string; category_id: string | null }[]).map(p => [p.id, p.category_id]))
  const convCat = new Map(((convs ?? []) as { id: string; product_category_id: string | null }[]).map(c => [c.id, c.product_category_id]))

  // Cuotas de esos pagos → matrícula/convocatoria
  const chargeIds = [...new Set(pays.map(p => p.charge_external_id).filter(Boolean))] as string[]
  const charges = chargeIds.length
    ? await fetchByIn(sb, 'account_charges', 'external_id, enrollment_id, convocatoria_id', 'external_id', chargeIds)
    : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chargeOf = new Map<string, any>(charges.map(c => [c.external_id, c]))

  // Matrículas de las cuotas → programa
  const enrIds = [...new Set(charges.map(c => c.enrollment_id).filter(Boolean))] as string[]
  const enrs = enrIds.length
    ? await fetchByIn(sb, 'academic_student_enrollments', 'id, program_id', 'id', enrIds)
    : []
  const enrProg = new Map(enrs.map(e => [e.id, e.program_id]))

  // Fallback final: programa único del estudiante
  const needStudent = [...new Set(pays
    .filter(p => {
      const ch = p.charge_external_id ? chargeOf.get(p.charge_external_id) : null
      return !(ch && ((ch.enrollment_id && progCat.get(enrProg.get(ch.enrollment_id))) || (ch.convocatoria_id && convCat.get(ch.convocatoria_id))))
    })
    .map(p => p.student_id).filter(Boolean))] as string[]
  const stuEnrs = needStudent.length
    ? await fetchByIn(sb, 'academic_student_enrollments', 'student_id, program_id', 'student_id', needStudent)
    : []
  const stuPrograms = new Map<string, Set<string>>()
  for (const e of stuEnrs as { student_id: string; program_id: string | null }[]) {
    if (!e.program_id) continue
    if (!stuPrograms.has(e.student_id)) stuPrograms.set(e.student_id, new Set())
    stuPrograms.get(e.student_id)!.add(e.program_id)
  }

  const SIN = 'Sin categoría'
  const categoryOf = (p: { charge_external_id: string | null; student_id: string | null }): string => {
    const ch = p.charge_external_id ? chargeOf.get(p.charge_external_id) : null
    if (ch?.enrollment_id) {
      const cid = progCat.get(enrProg.get(ch.enrollment_id))
      if (cid && catName.has(cid)) return catName.get(cid)!
    }
    if (ch?.convocatoria_id) {
      const cid = convCat.get(ch.convocatoria_id)
      if (cid && catName.has(cid)) return catName.get(cid)!
    }
    const progsOf = p.student_id ? stuPrograms.get(p.student_id) : null
    if (progsOf?.size === 1) {
      const cid = progCat.get([...progsOf][0])
      if (cid && catName.has(cid)) return catName.get(cid)!
    }
    return SIN
  }

  // Matriz mes × categoría
  const matrix = new Map<string, number[]>() // categoría → 12 montos
  const countByMonth = Array(12).fill(0) as number[]
  let total = 0
  for (const p of pays) {
    const m = Number(String(p.paid_date).slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    const cat = categoryOf(p)
    if (!matrix.has(cat)) matrix.set(cat, Array(12).fill(0))
    const amount = Number(p.amount) || 0
    matrix.get(cat)![m] += amount
    countByMonth[m]++
    total += amount
  }

  // Columnas: categorías con recaudación, ordenadas por total desc; SIN al final
  const columns = [...matrix.entries()]
    .map(([cat, months]) => ({ cat, total: months.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => (a.cat === SIN ? 1 : b.cat === SIN ? -1 : b.total - a.total))
    .map(c => c.cat)

  // Desglose Flywire del año: medio de pago, moneda y país de origen
  const agg = (key: string) => {
    const m = new Map<string, { n: number; sum: number }>()
    for (const p of pays) {
      const v = p[key] || '(sin dato)'
      const a = m.get(v) ?? { n: 0, sum: 0 }
      a.n++; a.sum += Number(p.amount) || 0
      m.set(v, a)
    }
    return [...m.entries()].sort((x, y) => y[1].sum - x[1].sum)
      .map(([label, v]) => ({ label, n: v.n, sum: v.sum }))
  }

  return NextResponse.json({
    years, year,
    metodos: agg('payment_method'),
    monedas: agg('currency_from'),
    paises: agg('country_from'),
    columns,
    column_labels: columns.map(c => catSigla.get(c) ?? c),
    rows: Array.from({ length: 12 }, (_, m) => ({
      month: m + 1,
      cells: columns.map(c => matrix.get(c)![m]),
      total: columns.reduce((s, c) => s + matrix.get(c)![m], 0),
      count: countByMonth[m],
    })),
    column_totals: columns.map(c => matrix.get(c)!.reduce((s, v) => s + v, 0)),
    total,
    payments: pays.length,
  })
}
