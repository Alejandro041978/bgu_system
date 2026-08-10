import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { isStudentUser } from '@/lib/student-identity'
import { simularBackfill, aplicarBackfill, type Criterio } from '@/lib/collection-backfill'

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

// GET → simulacro. Siempre se mira antes de escribir: es una operación masiva
// sobre a qué aula entra cada estudiante.
export async function GET() {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const g = await requireStaff(); if ('error' in g) return g.error
  try {
    const sim = await simularBackfill(db())
    // El detalle completo pesa; la pantalla trabaja con el resumen, los
    // bloques pendientes y una muestra.
    return NextResponse.json({
      total: sim.total, por_criterio: sim.por_criterio, bloques: sim.bloques,
      muestra: sim.propuestas.filter(p => p.criterio !== 'pendiente').slice(0, 40),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST { modo: 'auto', criterios?: [...] }        → escribe las propuestas con criterio
// POST { modo: 'bloque', program_id, convocatoria_id, collection_id } → resuelve un bloque pendiente
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const g = await requireStaff(); if ('error' in g) return g.error

  const b = await req.json().catch(() => null) as {
    modo?: 'auto' | 'bloque'
    criterios?: Criterio[]
    program_id?: string; convocatoria_id?: string | null; collection_id?: string
  } | null
  const sb = db()

  if (b?.modo === 'bloque') {
    if (!b.program_id || !b.collection_id) {
      return NextResponse.json({ error: 'Falta program_id o collection_id' }, { status: 400 })
    }
    // La colección tiene que ser de ese programa. Lo valida el servidor: un
    // bloque mal resuelto son decenas de estudiantes en aulas ajenas.
    const { data: col } = await sb.from('moodle_collections').select('program_id').eq('id', b.collection_id).maybeSingle()
    if (!col) return NextResponse.json({ error: 'Colección no encontrada' }, { status: 404 })
    if (col.program_id !== b.program_id) return NextResponse.json({ error: 'Esa colección es de otro programa' }, { status: 400 })

    let q = sb.from('academic_student_enrollments')
      .update({ collection_id: b.collection_id })
      .eq('program_id', b.program_id).is('collection_id', null)
    q = b.convocatoria_id ? q.eq('convocatoria_id', b.convocatoria_id) : q.is('convocatoria_id', null)
    const { data, error } = await q.select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, escritas: (data ?? []).length })
  }

  try {
    const criterios = b?.criterios
    const r = await aplicarBackfill(sb, criterios?.length ? p => criterios.includes(p.criterio) : undefined)
    if (r.error) return NextResponse.json({ error: r.error, escritas: r.escritas }, { status: 500 })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
