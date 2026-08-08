import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { esIntento } from '@/lib/grade-sources'
import { huecosDeRegistro, filaDePlan, escribirPlan, SITUACIONES_EXENTAS, type Hueco } from '@/lib/curricular-plan'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  const out: unknown[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(d, d + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

// ---------------------------------------------------------------------------
// Cobertura del registro curricular: quién no tiene su malla completa.
//
// Un matriculado debe tener en su registro las asignaturas de su programa,
// cualquiera sea su estado. Sólo un IW justifica lo contrario. Esta ruta mide
// el desvío y, con POST, lo corrige creando las filas de plan que faltan.
// ---------------------------------------------------------------------------
async function analizar(sb: ReturnType<typeof db>) {
  const [cats, progs, courses, studs, enrs, grades, tcs, tItems] = await Promise.all([
    todo(sb, 'academic_programs_category', 'id, name'),
    todo(sb, 'academic_programs', 'id, name, category_id'),
    todo(sb, 'academic_courses', 'id, program_id, name, code, credits'),
    todo(sb, 'academic_students', 'id, document_number, first_name, last_name, second_last_name, email, situation'),
    todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, status'),
    todo(sb, 'academic_grades', 'document_number, course_name, source'),
    todo(sb, 'transfer_credits', 'id, student_id, dest_program_id, status'),
    todo(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id, dest_course_name'),
  ])

  const catName = new Map(cats.map(c => [c.id, c.name]))
  const prog = new Map(progs.map(p => [p.id, p]))
  const malla = new Map<string, typeof courses>()
  for (const c of courses) {
    if (!malla.has(c.program_id)) malla.set(c.program_id, [])
    malla.get(c.program_id)!.push(c)
  }
  const stu = new Map(studs.map(s => [s.id, s]))

  // Notas por documento. Las de plan cuentan como cubiertas (ya están en el
  // registro), así que aquí no se filtran por origen salvo convalidación, que
  // se resuelve por su propia tabla.
  const notasDe = new Map<string, { course_name: string | null }[]>()
  for (const g of grades) {
    if (!esIntento(g) && g.source !== 'plan') continue
    const d = String(g.document_number ?? '')
    if (!notasDe.has(d)) notasDe.set(d, [])
    notasDe.get(d)!.push(g)
  }

  const itemsDe = new Map<string, typeof tItems>()
  for (const i of tItems) {
    if (!itemsDe.has(i.transfer_credit_id)) itemsDe.set(i.transfer_credit_id, [])
    itemsDe.get(i.transfer_credit_id)!.push(i)
  }
  const convDe = new Map<string, typeof tItems>()
  for (const t of tcs) {
    if (t.status !== 'active') continue
    const k = `${t.student_id}|${t.dest_program_id}`
    if (!convDe.has(k)) convDe.set(k, [])
    convDe.get(k)!.push(...(itemsDe.get(t.id) ?? []))
  }

  const filas = []
  for (const e of enrs) {
    const s = stu.get(e.student_id)
    const p = prog.get(e.program_id)
    if (!s || !p) continue
    const cursos = malla.get(e.program_id) ?? []
    if (!cursos.length) continue
    const huecos: Hueco[] = huecosDeRegistro(
      cursos, notasDe.get(String(s.document_number ?? '')) ?? [], convDe.get(`${e.student_id}|${e.program_id}`) ?? [])
    if (!huecos.length) continue
    filas.push({
      enrollment_id: e.id, student_id: s.id, program_id: p.id,
      documento: s.document_number,
      estudiante: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' '),
      email: s.email ?? null,
      programa: p.name, categoria: catName.get(p.category_id) ?? '—',
      situacion: s.situation ?? 'activo',
      exenta: SITUACIONES_EXENTAS.includes(String(s.situation ?? '')),
      malla: cursos.length, faltan: huecos.length,
      huecos,
    })
  }
  return { filas, stu }
}

export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const categoria = req.nextUrl.searchParams.get('categoria') ?? ''
  const programa = req.nextUrl.searchParams.get('programa') ?? ''
  const { filas } = await analizar(db())

  const visibles = filas
    .filter(f => !categoria || f.categoria === categoria)
    .filter(f => !programa || f.program_id === programa)
    .sort((a, b) => Number(a.exenta) - Number(b.exenta) || b.faltan - a.faltan || a.estudiante.localeCompare(b.estudiante))

  const porCategoria: Record<string, { matriculas: number; exentas: number; asignaturas: number }> = {}
  for (const f of filas) {
    const c = (porCategoria[f.categoria] ??= { matriculas: 0, exentas: 0, asignaturas: 0 })
    c.matriculas++
    if (f.exenta) c.exentas++; else c.asignaturas += f.faltan
  }

  return NextResponse.json({
    resumen: porCategoria,
    total: visibles.length,
    corregibles: visibles.filter(f => !f.exenta).length,
    asignaturas: visibles.filter(f => !f.exenta).reduce((s, f) => s + f.faltan, 0),
    // Los huecos completos pesan mucho y no se pintan: basta el conteo.
    filas: visibles.map(({ huecos, ...f }) => ({ ...f, ejemplo: huecos.slice(0, 3).map(h => h.name) })),
  })
}

// POST { enrollment_ids } → crea las filas de plan que faltan.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as { enrollment_ids?: string[] } | null
  const ids = new Set(b?.enrollment_ids ?? [])
  if (!ids.size) return NextResponse.json({ error: 'No hay matrículas seleccionadas' }, { status: 400 })

  const sb = db()
  const { filas, stu } = await analizar(sb)
  const elegidas = filas.filter(f => ids.has(f.enrollment_id))
  // Un IW no se completa ni pidiéndolo: su registro está incompleto por una
  // razón, y llenarlo borraría esa información.
  const exentas = elegidas.filter(f => f.exenta)
  const aplicables = elegidas.filter(f => !f.exenta)

  const nuevas: Record<string, unknown>[] = []
  for (const f of aplicables) {
    const s = stu.get(f.student_id)
    if (!s?.document_number) continue
    const est = {
      id: s.id, document_number: String(s.document_number), email: s.email ?? null,
      nombre: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' '),
    }
    for (const h of f.huecos) nuevas.push(filaDePlan(est, h))
  }

  const r = await escribirPlan(sb, nuevas)
  if (r.error) return NextResponse.json({ error: r.error, creadas: r.creadas }, { status: 500 })
  return NextResponse.json({
    ok: true, matriculas: aplicables.length, asignaturas: r.creadas,
    omitidas_por_iw: exentas.length,
  })
}
