import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured } from '@/lib/moodle'
import { importAula, loadStudentsByExternal, CRON_ACTOR_UUID } from '@/lib/moodle-import'
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
// No se ARRANCAN aulas nuevas pasados los 180s; las que están en vuelo pueden
// usar hasta el segundo 230 (deadline de sus llamadas WS). El margen restante
// del maxDuration=300 queda para los recálculos globales y la respuesta.
const BUDGET_MS = 180_000
const WS_DEADLINE_MS = 230_000

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const started = Date.now()
  const sb = db()

  // Aulas a importar: moodle_course_links, que es donde vive el vínculo desde
  // que se movió de la oferta formativa al plan de estudios.
  //
  // Antes esto leía semester_offerings.moodle_course_id. La migración quedó a
  // medias: las tablas nuevas, las colecciones y la pantalla se construyeron y
  // se cargaron 587 vínculos, pero el importador nunca cambió de fuente. El
  // resultado fue el peor posible — 381 aulas se veían "vinculadas" en pantalla
  // y el cron no las visitaba nunca, así que sus notas no llegaban y nada daba
  // error.
  //
  // Y se respeta sync_enabled, que hasta ahora no controlaba nada: vincular
  // declara la correspondencia, encender autoriza que las notas entren al
  // expediente. Son dos permisos distintos y el segundo tiene que poder
  // negarse.
  const { data: links } = await sb.from('moodle_course_links')
    .select('aula_id').eq('kind', 'asignatura').eq('sync_enabled', true).is('replaced_at', null)
  let aulaIds = [...new Set(((links ?? []) as { aula_id: number }[])
    .map(l => Number(l.aula_id)).filter(n => isFinite(n) && n > 0))]

  // ?aula=N importa SOLO esa aula, saltando la rotación. Para operar un caso
  // puntual (re-importar tras corregir algo) sin esperar a que la cola dé la
  // vuelta al campus. Sigue exigiendo el vínculo encendido: esto elige entre
  // las aulas autorizadas, no autoriza ninguna.
  const soloAula = Number(req.nextUrl.searchParams.get('aula') ?? NaN)
  if (isFinite(soloAula)) {
    if (!aulaIds.includes(soloAula)) {
      return NextResponse.json({ error: `El aula ${soloAula} no está vinculada con la sincronización encendida.` }, { status: 400 })
    }
    aulaIds = [soloAula]
  }

  if (!aulaIds.length) {
    return NextResponse.json({
      ok: true, aulas: 0,
      nota: 'Ningún aula tiene la sincronización encendida. Se vinculan en Colecciones y se encienden ahí mismo.',
    })
  }

  // Rotación justa: cada intento deja huella en moodle_aula_audit.last_import_at
  // (con o sin cambios, aceptado o rechazado) y se procesa primero lo menos
  // reciente. Así ninguna aula lenta acapara las corridas.
  const { data: marks } = await sb.from('moodle_aula_audit')
    .select('aula_id, last_import_at').in('aula_id', aulaIds)
  const lastImport = new Map<number, string>(((marks ?? []) as { aula_id: number; last_import_at: string | null }[])
    .filter(m => m.last_import_at).map(m => [Number(m.aula_id), String(m.last_import_at)]))
  aulaIds.sort((a, b) => (lastImport.get(a) ?? '').localeCompare(lastImport.get(b) ?? ''))

  // Catálogo de estudiantes una sola vez para toda la corrida
  const byExternal = await loadStudentsByExternal(sb)

  let inserted = 0, updated = 0, unchanged = 0
  const importadas: Record<string, unknown>[] = []
  const rechazadas: Record<string, unknown>[] = []
  const errores: Record<string, unknown>[] = []
  const pendientes: number[] = []

  const marcar = async (id: number) => {
    await sb.from('moodle_aula_audit')
      .update({ last_import_at: new Date().toISOString() }).eq('aula_id', id)
  }

  const procesar = async (id: number) => {
    try {
      const r = await importAula(sb, id, CRON_ACTOR_UUID, { byExternal, deadlineMs: started + WS_DEADLINE_MS })
      if (!r.ok) { rechazadas.push({ aula: id, motivo: r.error }); return }
      const s = r.summary
      inserted += s.inserted; updated += s.updated; unchanged += s.unchanged
      if (s.errors?.length) errores.push({ aula: id, errores: s.errors })
      importadas.push({
        aula: id, nuevas: s.inserted, actualizadas: s.updated, sin_cambio: s.unchanged,
        protegidas: s.protected_rows, cerradas: s.locked_rows, detalles: s.detalles_escritos,
      })
    } catch (e) {
      errores.push({ aula: id, errores: [String(e)] })
    } finally {
      try { await marcar(id) } catch { /* la rotación tolera huecos */ }
    }
  }

  // Pool de 3 trabajadores: el cuello es la latencia del WS de Moodle, no la
  // base — tres reportes en vuelo triplican el avance sin castigar al campus.
  let cursor = 0
  const worker = async () => {
    while (cursor < aulaIds.length) {
      if (Date.now() - started > BUDGET_MS) break
      const id = aulaIds[cursor++]
      await procesar(id)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  pendientes.push(...aulaIds.slice(cursor))

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
