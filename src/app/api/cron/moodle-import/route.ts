import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured } from '@/lib/moodle'
import { importAula, CRON_ACTOR_UUID } from '@/lib/moodle-import'
import { computeGraduates } from '@/lib/graduates'
import { recomputeSituations } from '@/lib/withdrawals'
import { advanceCarousels } from '@/lib/carousel'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Importación automática de actas Moodle (4 veces al día, vercel.json).
// Recorre todas las aulas VINCULADAS y les aplica exactamente el mismo
// pipeline que el botón manual: compuerta de política (pesos auditados = 100,
// escala 100, visible), propiedad de la fila, blindajes, actas cerradas y
// auditoría. Un aula que no cumple se reporta y se salta — nunca se fuerza.
//
// Presupuesto de tiempo: se procesan primero las aulas con la importación
// más vieja (max synced_at de sus notas); si la corrida no alcanza para
// todas, la siguiente (6 horas después) continúa donde quedó.
// ---------------------------------------------------------------------------
const BUDGET_MS = 240_000

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const started = Date.now()
  const sb = db()

  // Aulas vinculadas (fuente de verdad: semester_offerings.moodle_course_id)
  const { data: offs } = await sb.from('semester_offerings')
    .select('moodle_course_id').not('moodle_course_id', 'is', null)
  const aulaIds = [...new Set(((offs ?? []) as { moodle_course_id: string }[])
    .map(o => Number(o.moodle_course_id)).filter(n => isFinite(n) && n > 0))]

  // Prioridad: nunca importadas primero, luego las de importación más vieja
  const lastSync = new Map<number, string | null>()
  for (const id of aulaIds) {
    const { data } = await sb.from('academic_grades')
      .select('synced_at').eq('moodle_course_id', id)
      .order('synced_at', { ascending: false }).limit(1).maybeSingle()
    lastSync.set(id, data?.synced_at ?? null)
  }
  aulaIds.sort((a, b) => String(lastSync.get(a) ?? '').localeCompare(String(lastSync.get(b) ?? '')))

  let inserted = 0, updated = 0, unchanged = 0
  const importadas: Record<string, unknown>[] = []
  const rechazadas: Record<string, unknown>[] = []
  const errores: Record<string, unknown>[] = []
  const pendientes: number[] = []

  for (const id of aulaIds) {
    if (Date.now() - started > BUDGET_MS) { pendientes.push(id); continue }
    try {
      const r = await importAula(sb, id, CRON_ACTOR_UUID)
      if (!r.ok) {
        rechazadas.push({ aula: id, motivo: r.error })
        continue
      }
      const s = r.summary
      inserted += s.inserted; updated += s.updated; unchanged += s.unchanged
      if (s.errors?.length) errores.push({ aula: id, errores: s.errors })
      importadas.push({
        aula: id, nuevas: s.inserted, actualizadas: s.updated, sin_cambio: s.unchanged,
        protegidas: s.protected_rows, cerradas: s.locked_rows, detalles: s.detalles_escritos,
      })
    } catch (e) {
      errores.push({ aula: id, errores: [String(e)] })
    }
  }

  // Efectos globales una sola vez si algo cambió
  let recompute: Record<string, unknown> | null = null
  if (inserted + updated > 0) {
    try {
      const graduates = await computeGraduates(sb)
      const situations = await recomputeSituations(sb)
      const carousels = await advanceCarousels(sb)
      recompute = {
        egresados_detectados: graduates.graduates,
        situaciones_actualizadas: situations.updated,
        avances_de_carrusel: carousels.advanced.length,
      }
    } catch (e) {
      recompute = { error: 'Recalculo pendiente (los crons nocturnos convergen): ' + String(e) }
    }
  }

  return NextResponse.json({
    ok: true,
    aulas_vinculadas: aulaIds.length,
    procesadas: importadas.length,
    rechazadas_por_politica: rechazadas.length,
    con_errores: errores.length,
    pendientes_proxima_corrida: pendientes.length,
    nuevas: inserted, actualizadas: updated, sin_cambio: unchanged,
    detalle: { importadas, rechazadas, errores, pendientes },
    recompute,
    duracion_s: Math.round((Date.now() - started) / 1000),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
