import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { guardPagina } from '@/lib/page-guard'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Los campos que se pueden editar desde aquí. Antes se pasaba el cuerpo entero
// a un UPDATE, así que cualquiera con sesión podía escribir CUALQUIER columna de
// la asignatura mandando el JSON adecuado —external_id incluido, que es por
// donde entra el sincronizador—.
const EDITABLES = [
  'name', 'code', 'credits', 'level', 'hours', 'graduation_requirement',
  // Dónde se enseña y cómo se evalúa. Deciden sobre qué puede calificar otra
  // persona, y por eso el endgpoint exige el permiso de la página de Programas.
  'is_capstone', 'partner_campus',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // La malla la regula la Dirección Académica: el permiso de la página manda.
  const noAutorizado = await guardPagina('academic_programs')
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()

  const { id } = await params
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const k of EDITABLES) if (k in body) patch[k] = body[k]
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Ningún campo editable en la petición' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db() as any
  const { error } = await sb.from('academic_courses').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marcarla como capstone o de campus socio apaga la sincronización de sus
  // aulas: el aula da acceso, pero la nota nace fuera y la escribe una persona.
  // Desmarcarla NO la reanuda —volver a importar sobre un acta llevada a mano es
  // una decisión con consecuencias, y se toma mirando el aula concreta—.
  let aulas = 0
  if (patch.is_capstone === true || patch.partner_campus === true) {
    const { data } = await sb.from('moodle_course_links')
      .update({ sync_enabled: false, sync_enabled_by: user?.id ?? null, sync_enabled_at: new Date().toISOString() })
      .eq('course_id', id).eq('sync_enabled', true).select('aula_id')
    aulas = (data ?? []).length
  }

  return NextResponse.json({ ok: true, aulas_desconectadas: aulas })
}

// Lo que impide borrar una asignatura, dicho como le importa a quien la está
// borrando. La violación de clave foránea de Postgres nombra la restricción, no
// el problema: "academic_course_enrollments_course_id_fkey" no le dice a nadie
// que hay estudiantes matriculados en esa asignatura.
const REFERENCIAS: [string, string, string][] = [
  ['academic_grades', 'course_id', 'nota(s) registrada(s)'],
  ['academic_course_enrollments', 'course_id', 'matrícula(s) de estudiantes'],
  ['semester_offerings', 'course_id', 'oferta(s) en semestres'],
  ['moodle_course_links', 'course_id', 'aula(s) de Moodle vinculada(s)'],
  ['transfer_credit_items', 'dest_course_id', 'convalidación(es)'],
  ['transfer_scheme_items', 'dest_course_id', 'esquema(s) de convalidación'],
]

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const { id } = await params
  const sb = db()

  const bloqueos: string[] = []
  for (const [tabla, col, etiqueta] of REFERENCIAS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (sb as any).from(tabla).select('*', { count: 'exact', head: true }).eq(col, id)
    if (error) continue                     // tabla que aún no existe: no bloquea
    if ((count ?? 0) > 0) bloqueos.push(`${count} ${etiqueta}`)
  }
  if (bloqueos.length) {
    return NextResponse.json({
      error: 'No se puede eliminar: la asignatura tiene ' + bloqueos.join(', ')
        + '. Borrarla dejaría esos registros sin a qué pertenecer.',
      bloqueos,
    }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).from('academic_courses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
