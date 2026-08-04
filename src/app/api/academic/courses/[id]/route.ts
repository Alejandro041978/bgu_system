import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const { id } = await params
  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('academic_courses').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
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
