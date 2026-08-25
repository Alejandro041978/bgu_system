import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string, orden: string, tune = (q: any) => q) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tune(sb.from(tabla).select(cols)).order(orden).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Cierre diario de registros.
//
// Un registro se cierra cuando el estudiante terminó de rendir el 100% de las
// evaluaciones de esa asignatura. Al cerrarse queda calificado como aprobado o
// reprobado, y ya nadie lo vuelve a tocar: el trigger protect_edited_grades
// impide que una reimportación lo altere.
//
// El cierre es INDIVIDUAL, por estudiante y asignatura. No se cierra un aula
// ni una cohorte: las aulas se reutilizan —una asignatura se imparte,
// descansa y se vuelve a impartir por carrusel— y cerrar por aula arrastraría
// a estudiantes que recién entran.
//
// LA RESTRICCIÓN QUE IMPORTA: sólo se cierran registros de aulas que pasan la
// auditoría del campus. Esta semana encontramos aulas cuyas ponderaciones
// sumaban 133,89 y otras que sumaban 11. Un registro sellado sobre una
// estructura rota no lo arregla nadie después. Ante la duda, no se cierra: se
// queda pendiente y aparece en el auditor.
//
// Lo que NO cierra, a propósito:
//   · Aprobados con menos del 100% rendido — se quedan abiertos. Ya figuran
//     como aprobados (el acumulado sólo sube), y cerrarlos es una decisión de
//     inactividad que vendrá después.
//   · Pendientes — por ahora son eternos. Un pendiente es una asignatura
//     empezada, y sirve para decirle a quien se fue que no arranca de cero.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const seco = req.nextUrl.searchParams.get('simulacro') === '1'
  const sb = db()
  const t0 = Date.now()

  // Candidatos: del campus, sin cerrar, con el curso íntegramente rendido.
  const candidatos = await todo(sb, 'academic_grades',
    'external_id, document_number, course_code, moodle_course_id, final_grade, retake_grade, passing_score, rendido_pct, estado_academico',
    'external_id',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => q.eq('source', 'moodle').is('locked_at', null).gte('rendido_pct', 99.5))

  const aulas = [...new Set(candidatos.map(c => Number(c.moodle_course_id)).filter(n => n > 0))]
  const audit = await todo(sb, 'moodle_aula_audit',
    'aula_id, visible, escala_total, suma_coeficientes, shortname', 'aula_id')
  const audOf = new Map<number, Record<string, unknown>>()
  for (const a of audit) audOf.set(Number(a.aula_id), a)

  const aulaSirve = (id: number): string | null => {
    const a = audOf.get(id)
    if (!a) return 'el aula no está auditada'
    if (a.visible === false) return 'el aula está oculta'
    // Centésimas de tolerancia: bajo Natural la escala reporta 99.99999 o
    // 100.00003 por los decimales periódicos de los pesos convertidos.
    if (a.escala_total != null && Math.abs(Number(a.escala_total) - 100) > 0.02) return `la escala del total es ${a.escala_total}`
    if (a.suma_coeficientes == null) return 'el aula no tiene auditoría de ponderaciones'
    if (Math.abs(Number(a.suma_coeficientes) - 100) > 0.5) return `las ponderaciones suman ${a.suma_coeficientes}`
    return null
  }

  const aCerrar: string[] = []
  const porEstado: Record<string, number> = { aprobado: 0, reprobado: 0 }
  const bloqueadas = new Map<string, { aula: number; shortname: unknown; registros: number }>()

  for (const c of candidatos) {
    const motivo = aulaSirve(Number(c.moodle_course_id))
    if (motivo) {
      const k = `${c.moodle_course_id}|${motivo}`
      if (!bloqueadas.has(k)) bloqueadas.set(k, { aula: Number(c.moodle_course_id), shortname: audOf.get(Number(c.moodle_course_id))?.shortname ?? null, registros: 0 })
      bloqueadas.get(k)!.registros++
      continue
    }
    const estado = String(c.estado_academico ?? '')
    if (estado !== 'aprobado' && estado !== 'reprobado') continue
    porEstado[estado]++
    aCerrar.push(c.external_id)
  }

  const resumen = {
    simulacro: seco,
    candidatos: candidatos.length,
    a_cerrar: aCerrar.length,
    por_estado: porEstado,
    no_cerrados_por_el_aula: [...bloqueadas.entries()].map(([k, v]) => ({
      aula: v.aula, aula_nombre: v.shortname, motivo: k.split('|')[1], registros: v.registros,
    })).sort((a, b) => b.registros - a.registros),
    duracion_s: 0 as number,
  }
  if (seco || !aCerrar.length) {
    resumen.duracion_s = Math.round((Date.now() - t0) / 1000)
    return NextResponse.json({ ...resumen, cerrados: 0 })
  }

  const ahora = new Date().toISOString()
  let cerrados = 0
  for (let i = 0; i < aCerrar.length; i += 200) {
    const { error } = await sb.from('academic_grades')
      .update({ locked_at: ahora, locked_by: 'cron-cierre' })
      .in('external_id', aCerrar.slice(i, i + 200))
    if (error) return NextResponse.json({ ...resumen, error: error.message, cerrados }, { status: 500 })
    cerrados += Math.min(200, aCerrar.length - i)
  }

  resumen.duracion_s = Math.round((Date.now() - t0) / 1000)
  return NextResponse.json({ ...resumen, cerrados })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
