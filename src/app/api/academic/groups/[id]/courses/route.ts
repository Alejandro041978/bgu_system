import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// Las asignaturas que integran un carrusel: es su plan de estudios, no su
// calendario. Quién las dicta y cuándo sigue viviendo en la oferta.

// POST { course_id } → agregar la asignatura al carrusel
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const b = await req.json().catch(() => null) as { course_id?: string } | null
  if (!b?.course_id) return NextResponse.json({ error: 'Falta course_id' }, { status: 400 })
  const sb = db()

  const [{ data: g }, { data: c }] = await Promise.all([
    sb.from('academic_groups').select('program_id').eq('id', id).maybeSingle(),
    sb.from('academic_courses').select('program_id, name').eq('id', b.course_id).maybeSingle(),
  ])
  if (!g) return NextResponse.json({ error: 'Carrusel no encontrado' }, { status: 404 })
  if (!c) return NextResponse.json({ error: 'Asignatura no encontrada' }, { status: 404 })
  // La asignatura tiene que ser de la malla del programa del carrusel. Sin
  // esto, una ruta podría exigir asignaturas de otra carrera y el estudiante
  // no podría terminarla nunca.
  if (c.program_id !== g.program_id) {
    return NextResponse.json({ error: `"${c.name}" no pertenece a la malla de este programa` }, { status: 400 })
  }

  const { error } = await sb.from('academic_group_courses')
    .upsert({ group_id: id, course_id: b.course_id, created_by: user.email ?? null }, { onConflict: 'group_id,course_id', ignoreDuplicates: true })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Falta correr supabase/academic_group_courses.sql' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE ?course_id= → quitar la asignatura del carrusel
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const courseId = req.nextUrl.searchParams.get('course_id')
  if (!courseId) return NextResponse.json({ error: 'Falta course_id' }, { status: 400 })
  const sb = db()

  // Quitar una asignatura de un carrusel con gente dentro cambia lo que les
  // falta para avanzar: si era la última que les quedaba, el motor los pasa al
  // siguiente en la corrida siguiente. Se avisa con el número, no se impide.
  const { count } = await sb.from('academic_group_students')
    .select('student_id', { count: 'exact', head: true }).eq('group_id', id).eq('status', 'activo')

  const { error } = await sb.from('academic_group_courses')
    .delete().eq('group_id', id).eq('course_id', courseId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, estudiantes_activos: count ?? 0 })
}
