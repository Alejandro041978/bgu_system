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
// EL reconciliador: el único sitio que da de alta en las aulas.
//
// Colocar a alguien en un carrusel es una decisión académica —qué cursa y en
// qué orden avanza—; que el campus se parezca a esa decisión es una
// consecuencia, y la hace este cron. Antes la hacían además la colocación
// automática, la colocación individual, la matrícula y el motor de avance:
// cuatro dueños para el mismo efecto, y cada página del dominio del carrusel
// obligada a hablar de Moodle sin que fuera asunto suyo.
//
// Corre cada hora. Quien coloca a alguien vacía last_enrol_sync_at del
// carrusel, y como la rotación ordena por ese campo —un null va delante de
// cualquier fecha—, el carrusel recién tocado es el primero de la cola. Sin
// tabla de pendientes ni lógica nueva.
//
// Tampoco hay lógica de "qué cambió": syncGroup resuelve las aulas consultando
// la colección de cada estudiante en cada corrida, y matricular a quien ya está
// matriculado es inocuo en Moodle. Basta con volver a pasar. Eso también
// resuelve el otro caso para el que nació esto: una colección se arma de a poco
// —hoy 4 casillas de 40, la semana que viene 12— y los ya colocados tienen que
// recibir las aulas que se vayan añadiendo.
//
// La BAJA no espera aquí: quien completa un carrusel se desmatricula en el
// momento, para no quedarse ni una hora de más en aulas que ya no le tocan.
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
  // PAGINADO: PostgREST corta en 1000 filas y hay más de 1000 membresías
  // activas. Sin paginar, los carruseles cuyas filas caían después del corte
  // (BBA SP1/SP2/UP1/UP2, DCEU 003/015…) no entraban NUNCA a la rotación —
  // por eso llevaban last_enrol_sync_at en null (detectado el 24/09/2026).
  const conAlumnosSet = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data: miembros, error } = await sb.from('academic_group_students')
      .select('group_id').eq('status', 'activo').order('group_id').order('student_id').range(from, from + 999)
    if (error) return NextResponse.json({ error: 'academic_group_students: ' + error.message }, { status: 500 })
    for (const m of (miembros ?? []) as { group_id: string }[]) conAlumnosSet.add(String(m.group_id))
    if ((miembros ?? []).length < 1000) break
  }
  const conAlumnos = [...conAlumnosSet]
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
