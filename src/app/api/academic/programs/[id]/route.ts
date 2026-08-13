import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { guardPagina } from '@/lib/page-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Igual que en las asignaturas: lista blanca, en vez de volcar el cuerpo entero
// en un UPDATE. `partner_campus` decide sobre qué puede calificar otra persona,
// así que el endpoint exige el permiso de la página de Programas.
const EDITABLES = ['name', 'code', 'description', 'category_id', 'partner_campus'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardPagina('academic_programs')
  if (noAutorizado) return noAutorizado

  const { id } = await params
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const k of EDITABLES) if (k in body) patch[k] = body[k]
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Ningún campo editable en la petición' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('academic_programs').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const { id } = await params
  const supabase = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('academic_courses').select('id', { count: 'exact', head: true }).eq('program_id', id)
  if (count && count > 0) {
    return NextResponse.json({ error: 'No se puede eliminar un programa que tiene asignaturas. Elimina primero sus asignaturas.' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('academic_programs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
