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
//   Matriculados · Egresados · Titulados · Retirados (IW+LOA) · Reentry · Activos · Campus socio
//
// La unidad es la MATRÍCULA (estudiante × programa), no el estudiante: quien
// cursa dos programas cuenta dos veces, cada matrícula con su propio estado.
// Se tituló de la maestría y hoy cursa el doctorado -> titulado en Master
// Program y activo en Doctoral Program. Atribuir al estudiante una sola
// categoría hacía aparecer titulados de doctorado que no existen.
//
// Estado de cada matrícula, en este orden:
//   titulado / egresado — del par exacto en student_graduations. Un programa
//     terminado no se borra porque el estudiante se retire de otro.
//   retirado — el retiro (IW/LOA) no tiene programa: es del estudiante frente a
//     la institución, así que arrastra sus matrículas NO terminadas.
//   campus socio — el programa de la matrícula es de campus socio
//     (academic_programs.partner_campus); esto sí es del programa.
//   activo — el resto.
//
// Reentry va aparte (no suma): matrículas activas de estudiantes que se
// retiraron y volvieron.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const cats = await readAll(sb, 'academic_programs_category', 'id, name')
  const nameOfCat = new Map<string, string>(cats.map((c: { id: string; name: string }) => [c.id, c.name]))

  const programs = await readAll(sb, 'academic_programs', 'id, category_id, partner_campus')
  const catOfProgram = new Map<string, string | null>(programs.map((p: { id: string; category_id: string | null }) => [p.id, p.category_id]))
  const partnerPrograms = new Set<string>(
    (programs as { id: string; partner_campus: boolean | null }[]).filter(p => p.partner_campus).map(p => p.id))

  const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id')

  // Estudiantes reincorporados (tienen un retiro con estado 'reincorporado')
  const wds = await readAll(sb, 'student_withdrawals', 'student_id, status')
  const reincorporados = new Set<string>(
    (wds as { student_id: string; status: string }[]).filter(w => w.status === 'reincorporado').map(w => w.student_id))

  const students = await readAll(sb, 'academic_students', 'id, situation')
  const sitOf = new Map<string, string>(students.map((s: { id: string; situation: string }) => [s.id, s.situation]))

  // Egreso/titulación por (estudiante, programa)
  const grads = await readAll(sb, 'student_graduations', 'student_id, program_id, titulacion_status')
  const gradOf = new Map<string, string>(
    (grads as { student_id: string; program_id: string; titulacion_status: string }[])
      .map(g => [`${g.student_id}|${g.program_id}`, g.titulacion_status]))

  type Cell = { matriculados: number; egresados: number; titulados: number; retirados: number; reentry: number; activos: number; campus_socio: number }
  const zero = (): Cell => ({ matriculados: 0, egresados: 0, titulados: 0, retirados: 0, reentry: 0, activos: 0, campus_socio: 0 })
  const byCat = new Map<string, Cell>()
  const total = zero()
  const seen = new Set<string>()

  for (const e of enrolls as { student_id: string | null; program_id: string | null }[]) {
    if (!e.student_id || !e.program_id) continue
    const pair = `${e.student_id}|${e.program_id}`
    if (seen.has(pair)) continue
    seen.add(pair)

    const catKey = catOfProgram.get(e.program_id) ?? '__none__'
    if (!byCat.has(catKey)) byCat.set(catKey, zero())
    const c = byCat.get(catKey)!
    const sit = sitOf.get(e.student_id) ?? 'activo'
    const grad = gradOf.get(pair)

    c.matriculados++; total.matriculados++
    let activa = false
    if (grad === 'titulado') { c.titulados++; total.titulados++ }
    else if (grad) { c.egresados++; total.egresados++ }
    else if (sit === 'retiro_permanente' || sit === 'retiro_temporal') { c.retirados++; total.retirados++ }
    else if (partnerPrograms.has(e.program_id)) { c.campus_socio++; total.campus_socio++ }
    else { c.activos++; total.activos++; activa = true }

    if (activa && reincorporados.has(e.student_id)) { c.reentry++; total.reentry++ }
  }

  const rows = [...byCat.entries()].map(([key, c]) => ({
    category: key === '__none__' ? '(Sin categoría)' : (nameOfCat.get(key) ?? key),
    ...c,
  })).sort((a, b) => b.matriculados - a.matriculados)

  return NextResponse.json({ rows, total })
}
