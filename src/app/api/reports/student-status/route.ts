import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from(table).select(cols).range(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// Reporte "Estado de estudiantes": por categoría de programa,
//   Matriculados · Egresados · Retirados (IW+LOA) · Reentry · Activos · Campus socio
//
// Cada estudiante se atribuye a UNA categoría (la de su matrícula más reciente)
// para que las filas sumen limpio al total. La situación (activo/egresado/…) ya
// está calculada y mantenida en academic_students.situation.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const cats = await readAll(sb, 'academic_programs_category', 'id, name')
  const nameOfCat = new Map<string, string>(cats.map((c: { id: string; name: string }) => [c.id, c.name]))

  const programs = await readAll(sb, 'academic_programs', 'id, category_id')
  const catOfProgram = new Map<string, string | null>(programs.map((p: { id: string; category_id: string | null }) => [p.id, p.category_id]))

  // Estudiante → categoría de su matrícula MÁS RECIENTE (atribución única)
  const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id, enrollment_date')
  const bestOf = new Map<string, { date: string; cat: string | null }>()
  for (const e of enrolls as { student_id: string | null; program_id: string | null; enrollment_date: string | null }[]) {
    if (!e.student_id) continue
    const cat = e.program_id ? (catOfProgram.get(e.program_id) ?? null) : null
    const date = e.enrollment_date ?? ''
    const cur = bestOf.get(e.student_id)
    if (!cur || date > cur.date) bestOf.set(e.student_id, { date, cat })
  }

  // Estudiantes reincorporados (tienen un retiro con estado 'reincorporado')
  const wds = await readAll(sb, 'student_withdrawals', 'student_id, status')
  const reincorporados = new Set<string>(
    (wds as { student_id: string; status: string }[]).filter(w => w.status === 'reincorporado').map(w => w.student_id))

  const students = await readAll(sb, 'academic_students', 'id, situation')
  const sitOf = new Map<string, string>(students.map((s: { id: string; situation: string }) => [s.id, s.situation]))

  type Cell = { matriculados: number; egresados: number; retirados: number; reentry: number; activos: number; campus_socio: number }
  const zero = (): Cell => ({ matriculados: 0, egresados: 0, retirados: 0, reentry: 0, activos: 0, campus_socio: 0 })
  const byCat = new Map<string, Cell>()
  const total = zero()

  for (const [studentId, best] of bestOf) {
    const key = best.cat ?? '__none__'
    if (!byCat.has(key)) byCat.set(key, zero())
    const c = byCat.get(key)!
    const sit = sitOf.get(studentId) ?? 'activo'

    c.matriculados++; total.matriculados++
    if (sit === 'egresado') { c.egresados++; total.egresados++ }
    else if (sit === 'retiro_permanente' || sit === 'retiro_temporal') { c.retirados++; total.retirados++ }
    else if (sit === 'campus_socio') { c.campus_socio++; total.campus_socio++ }
    else { c.activos++; total.activos++ }   // 'activo' y cualquier otro
    if (reincorporados.has(studentId)) { c.reentry++; total.reentry++ }
  }

  const rows = [...byCat.entries()].map(([key, c]) => ({
    category: key === '__none__' ? '(Sin categoría)' : (nameOfCat.get(key) ?? key),
    ...c,
  })).sort((a, b) => b.matriculados - a.matriculados)

  return NextResponse.json({ rows, total })
}
