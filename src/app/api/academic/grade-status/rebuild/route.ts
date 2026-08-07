import { passingByCourse, passingFor } from '@/lib/passing-score'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { rendidoPct, estadoAcademico, irrecuperable, type ItemProceso } from '@/lib/grade-status'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

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
// Recalcula el estado académico de todas las notas ya escritas.
//
// Dos poblaciones distintas, y la diferencia importa:
//
//   · Notas de MOODLE — la nota es un acumulado sobre el 100% del curso. Su
//     estado sale de la aritmética: acumuló el mínimo → aprobado; rindió todo
//     (o el registro está cerrado) y no llegó → reprobado; el resto, pendiente.
//
//   · Notas de SYSTEMACTIVA — son resultados finales, no acumulados: vienen de
//     un sistema que ya está apagado y que registraba la nota de cierre. Una
//     calificación por debajo del mínimo es un reprobado, no un curso a medias.
//     Las que llegaron SIN calificar son otra cosa: son matrículas en curso, y
//     ésas sí quedan pendientes esperando que Moodle las construya.
//
// Por omisión simula. Escribe con ?apply=1.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const apply = req.nextUrl.searchParams.get('apply') === '1'
  const sb = db()
  const t0 = Date.now()

  const notas = await todo(sb, 'academic_grades',
    'external_id, course_id, source, final_grade, retake_grade, passing_score, locked_at, rendido_pct, estado_academico', 'external_id')
  // El mínimo lo pone la categoría del programa. Antes aquí había un 70 fijo
  // como respaldo, así que al faltar el dato de la fila un Master se habría
  // recalculado con la vara de Bachelor.
  const porCurso = await passingByCourse(sb)
  const detalles = await todo(sb, 'academic_grade_details', 'external_id, process_grades', 'id')
  const detOf = new Map<string, ItemProceso[] | null>()
  for (const d of detalles) detOf.set(String(d.external_id), Array.isArray(d.process_grades) ? d.process_grades : null)

  const cambios: { external_id: string; rendido_pct: number | null; estado_academico: string }[] = []
  const cuenta: Record<string, number> = { aprobado: 0, reprobado: 0, pendiente: 0 }
  const porOrigen: Record<string, Record<string, number>> = {}
  let alerta = 0

  for (const n of notas) {
    const valor = n.retake_grade ?? n.final_grade ?? null
    const esMoodle = n.source === 'moodle' || n.source === 'csv'
    const rend = esMoodle ? rendidoPct(detOf.get(String(n.external_id))) : null

    let estado: string
    if (!esMoodle && valor != null) {
      // Resultado final de un sistema apagado: no hay curso a medias que valer.
      const min = passingFor(n, porCurso)
      estado = min != null && Number(valor) >= min ? 'aprobado' : 'reprobado'
    } else {
      estado = estadoAcademico({
        valor, passing_score: passingFor(n, porCurso), rendido_pct: rend, cerrado: !!n.locked_at,
      })
    }

    cuenta[estado] = (cuenta[estado] ?? 0) + 1
    const o = String(n.source ?? 'sin origen')
    porOrigen[o] = porOrigen[o] ?? { aprobado: 0, reprobado: 0, pendiente: 0 }
    porOrigen[o][estado]++
    if (estado === 'pendiente' && irrecuperable({ valor, passing_score: passingFor(n, porCurso), rendido_pct: rend })) alerta++

    const igual = String(n.estado_academico ?? '') === estado
      && String(n.rendido_pct ?? '') === String(rend ?? '')
    if (!igual) cambios.push({ external_id: n.external_id, rendido_pct: rend, estado_academico: estado })
  }

  const resumen = {
    simulacro: !apply,
    notas: notas.length,
    con_detalle: detalles.length,
    estado: cuenta,
    por_origen: porOrigen,
    pendientes_que_ya_no_pueden_aprobar: alerta,
    a_escribir: cambios.length,
    duracion_s: 0 as number,
  }
  if (!apply) {
    resumen.duracion_s = Math.round((Date.now() - t0) / 1000)
    return NextResponse.json(resumen)
  }

  let escritas = 0
  for (let i = 0; i < cambios.length; i += 500) {
    const { error } = await sb.from('academic_grades').upsert(cambios.slice(i, i + 500), { onConflict: 'external_id' })
    if (error) return NextResponse.json({ ...resumen, error: error.message, escritas }, { status: 500 })
    escritas += Math.min(500, cambios.length - i)
  }
  resumen.duracion_s = Math.round((Date.now() - t0) / 1000)
  return NextResponse.json({ ...resumen, escritas })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
