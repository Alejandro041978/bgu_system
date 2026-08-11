import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured } from '@/lib/moodle'
import { syncGroup } from '@/lib/moodle-provision'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// No se arrancan grupos nuevos pasado el presupuesto; el que esté en vuelo
// termina. La rotación garantiza que la próxima corrida siga donde quedó.
const BUDGET_MS = 200_000

// ---------------------------------------------------------------------------
// Alta en las aulas que se fueron añadiendo a la colección.
//
// Una colección se arma de a poco: hoy 4 casillas de 40, la semana que viene
// 12. Los estudiantes ya colocados en el carrusel no volverían a pasar por el
// aprovisionamiento nunca, así que se quedarían sin las aulas nuevas.
//
// Este cron vuelve a sincronizar los grupos activos. No hay lógica de "qué
// cambió": syncGroup resuelve las aulas consultando la colección en cada
// corrida, y matricular a quien ya está matriculado es inocuo en Moodle. Así
// que basta con volver a pasar.
//
// Rotación por last_enrol_sync_at: se atienden primero los grupos que llevan
// más tiempo sin revisarse, y ninguno acapara las corridas.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const started = Date.now()
  const sb = db()

  // Sólo grupos con gente dentro: los vacíos no tienen a quién matricular.
  const { data: miembros } = await sb.from('academic_group_students')
    .select('group_id').eq('status', 'activo')
  const conAlumnos = [...new Set((miembros ?? []).map((m: { group_id: string }) => m.group_id))] as string[]
  if (!conAlumnos.length) return NextResponse.json({ ok: true, grupos: 0, nota: 'Ningún grupo con estudiantes activos' })

  const { data: grupos } = await sb.from('academic_groups')
    .select('id, name, last_enrol_sync_at').in('id', conAlumnos)
  const orden = ((grupos ?? []) as { id: string; name: string; last_enrol_sync_at: string | null }[])
    .sort((a, b) => String(a.last_enrol_sync_at ?? '').localeCompare(String(b.last_enrol_sync_at ?? '')))

  const detalle: Record<string, unknown>[] = []
  let matriculas = 0, cuentasCreadas = 0
  const errores: string[] = []
  let procesados = 0

  for (const g of orden) {
    if (Date.now() - started > BUDGET_MS) break
    procesados++
    try {
      const r = await syncGroup(g.id)
      matriculas += r.enrol_ops
      cuentasCreadas += r.accounts_created
      if (r.errors.length) errores.push(...r.errors.map(e => `${g.name}: ${e}`))
      if (r.enrol_ops || r.accounts_created || r.courses_unmapped.length || r.sin_coleccion) {
        detalle.push({
          grupo: g.name, estudiantes: r.students_total,
          altas: r.enrol_ops, cuentas_creadas: r.accounts_created,
          asignaturas_sin_aula: r.courses_unmapped,
          // Los que entraron por el respaldo (aula de la oferta) porque su
          // matrícula no tiene colección. Mientras este número no sea cero, el
          // respaldo sigue haciendo falta y no se puede retirar.
          sin_coleccion: r.sin_coleccion,
        })
      }
    } catch (e) {
      errores.push(`${g.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      try {
        await sb.from('academic_groups')
          .update({ last_enrol_sync_at: new Date().toISOString() }).eq('id', g.id)
      } catch { /* la rotación tolera huecos */ }
    }
  }

  return NextResponse.json({
    ok: true,
    grupos_con_alumnos: orden.length,
    procesados,
    pendientes_proxima_corrida: Math.max(0, orden.length - procesados),
    altas_en_aulas: matriculas,
    cuentas_creadas: cuentasCreadas,
    detalle,
    errores,
    duracion_s: Math.round((Date.now() - started) / 1000),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
