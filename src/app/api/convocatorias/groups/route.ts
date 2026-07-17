import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// POST { convocatoria_id, group_id } → vincula un carrusel de ENTRADA a la
// convocatoria. Una convocatoria cubre una categoría con varios programas: se
// permite un carrusel de entrada POR PROGRAMA; si ya había otro del mismo
// programa, se reemplaza (el matriculado en ese programa entra por el nuevo).
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.convocatoria_id || !b?.group_id) {
    return NextResponse.json({ error: 'Falta convocatoria_id o group_id' }, { status: 400 })
  }
  const sb = db()
  const { data: group } = await sb.from('academic_groups')
    .select('id, program_id').eq('id', b.group_id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Carrusel no encontrado' }, { status: 404 })

  // Reemplazo por programa: quitar cualquier otro carrusel del mismo programa
  const { data: existing } = await sb.from('convocatoria_groups')
    .select('group_id, academic_groups(program_id)').eq('convocatoria_id', b.convocatoria_id)
  const mismos = ((existing ?? []) as { group_id: string; academic_groups: { program_id: string } | null }[])
    .filter(l => l.academic_groups?.program_id === group.program_id && l.group_id !== b.group_id)
  for (const m of mismos) {
    await sb.from('convocatoria_groups').delete()
      .eq('convocatoria_id', b.convocatoria_id).eq('group_id', m.group_id)
  }

  const { error } = await sb.from('convocatoria_groups')
    .upsert({ convocatoria_id: b.convocatoria_id, group_id: b.group_id }, { onConflict: 'convocatoria_id,group_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, reemplazados: mismos.length })
}

// DELETE ?convocatoria_id=&group_id= → desvincular
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria_id')
  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!convocatoriaId || !groupId) return NextResponse.json({ error: 'Falta convocatoria_id o group_id' }, { status: 400 })
  const sb = db()
  const { error } = await sb.from('convocatoria_groups').delete()
    .eq('convocatoria_id', convocatoriaId).eq('group_id', groupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
