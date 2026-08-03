import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { moodleConfigured, moodleUserState } from '@/lib/moodle'
import { overdueByStudent, activeExceptionMap } from '@/lib/moodle-access'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string, orden: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Estado del campus por categoría de programa.
//
// Junta en una sola foto tres cosas que hoy hay que ir a buscar por separado:
// quién tiene cuenta, quién puede entrar, y quién entra de verdad. Esa última
// es la que ningún dato del ERP contesta — hace falta preguntarle a Moodle
// cuándo accedió cada uno por última vez.
// ---------------------------------------------------------------------------
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sb = db()

  const [estudiantes, matriculas, programas, over, exc] = await Promise.all([
    todo(sb, 'academic_students', 'id, moodle_user_id, moodle_suspended, situation', 'id'),
    todo(sb, 'academic_student_enrollments', 'student_id, program_id', 'id'),
    todo(sb, 'academic_programs', 'id, name, partner_campus, category:academic_programs_category(id, name)', 'id'),
    overdueByStudent(sb),
    activeExceptionMap(sb),
  ])

  // Un estudiante puede cursar dos programas de categorías distintas: se cuenta
  // en cada una. El total de abajo, en cambio, cuenta personas.
  const prog = new Map<string, { cat: string; catNombre: string; externo: boolean }>()
  for (const p of programas as { id: string; partner_campus: unknown; category: { id: string; name: string } | null }[]) {
    prog.set(p.id, {
      cat: p.category?.id ?? 'sin-categoria',
      catNombre: p.category?.name ?? 'Sin categoría',
      externo: !!p.partner_campus,
    })
  }
  const catsDe = new Map<string, Set<string>>()
  const soloExterno = new Map<string, boolean>()
  for (const m of matriculas as { student_id: string; program_id: string }[]) {
    const p = prog.get(m.program_id); if (!p) continue
    if (!catsDe.has(m.student_id)) catsDe.set(m.student_id, new Set())
    catsDe.get(m.student_id)!.add(p.cat)
    // Sólo es "de campus externo" quien no tiene NINGÚN programa nuestro.
    const prev = soloExterno.get(m.student_id)
    soloExterno.set(m.student_id, prev === undefined ? p.externo : prev && p.externo)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alumnos = estudiantes as any[]
  const conCuenta = alumnos.filter(s => s.moodle_user_id)
  const estado = moodleConfigured()
    ? await moodleUserState(conCuenta.map(s => Number(s.moodle_user_id)))
    : new Map<number, { suspended: boolean; lastaccess: number }>()

  const hace30 = Math.floor((Date.now() - 30 * 86400000) / 1000)
  const nombreCat = new Map<string, string>()
  for (const p of prog.values()) nombreCat.set(p.cat, p.catNombre)

  interface Fila {
    category_id: string; categoria: string
    estudiantes: number; con_cuenta: number; sin_cuenta: number
    sin_acceso_por_deuda: number; exceptuados: number
    campus_externo: number; activos_30d: number; nunca_entraron: number
  }
  const filas = new Map<string, Fila>()
  const nueva = (cat: string): Fila => ({
    category_id: cat, categoria: nombreCat.get(cat) ?? 'Sin categoría',
    estudiantes: 0, con_cuenta: 0, sin_cuenta: 0,
    sin_acceso_por_deuda: 0, exceptuados: 0, campus_externo: 0, activos_30d: 0, nunca_entraron: 0,
  })

  const totales = nueva('__total')
  totales.categoria = 'Total'

  for (const s of alumnos) {
    const cats = catsDe.get(s.id)
    if (!cats?.size) continue                     // sin matrícula: fuera del reporte
    const uid = Number(s.moodle_user_id)
    const est = estado.get(uid)
    const externo = soloExterno.get(s.id) === true
    const deuda = (over.get(s.id) ?? 0) > 0.005
    const conExc = exc.has(s.id)

    for (const cat of cats) {
      if (!filas.has(cat)) filas.set(cat, nueva(cat))
      const f = filas.get(cat)!
      f.estudiantes++
      if (s.moodle_user_id) f.con_cuenta++; else f.sin_cuenta++
      if (externo) f.campus_externo++
      // Sin acceso por deuda = suspendido DE VERDAD en el campus. No la
      // intención del ERP: lo que el estudiante se encuentra al intentar entrar.
      if (est?.suspended) f.sin_acceso_por_deuda++
      if (conExc && deuda) f.exceptuados++
      if (est && est.lastaccess > 0 && est.lastaccess >= hace30) f.activos_30d++
      if (est && est.lastaccess === 0) f.nunca_entraron++
    }
  }

  // El total cuenta personas, no pares persona-categoría.
  for (const s of alumnos) {
    if (!catsDe.get(s.id)?.size) continue
    const est = estado.get(Number(s.moodle_user_id))
    totales.estudiantes++
    if (s.moodle_user_id) totales.con_cuenta++; else totales.sin_cuenta++
    if (soloExterno.get(s.id) === true) totales.campus_externo++
    if (est?.suspended) totales.sin_acceso_por_deuda++
    if (exc.has(s.id) && (over.get(s.id) ?? 0) > 0.005) totales.exceptuados++
    if (est && est.lastaccess > 0 && est.lastaccess >= hace30) totales.activos_30d++
    if (est && est.lastaccess === 0) totales.nunca_entraron++
  }

  const { data: corrida } = await sb.from('system_job_runs')
    .select('ran_at, ok, summary, errors').eq('job', 'moodle-access')
    .order('ran_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({
    campus_configurado: moodleConfigured(),
    ultima_reconciliacion: corrida ?? null,
    consultadas_en_moodle: estado.size,
    filas: [...filas.values()].sort((a, b) => b.estudiantes - a.estudiantes),
    total: totales,
  })
}
