import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { reponerRegistroTrasBorrar } from '@/lib/transfer-credit-server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// GET → cabecera + ítems de una convalidación
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()
  const { data: transfer } = await sb.from('transfer_credits').select('*').eq('id', id).maybeSingle()
  if (!transfer) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const { data: items } = await sb.from('transfer_credit_items')
    .select('*').eq('transfer_credit_id', id).order('created_at')
  return NextResponse.json({ transfer, items: items ?? [] })
}

// DELETE → elimina la convalidación (y sus ítems + reflejo en notas)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()
  // Borra el reflejo en academic_grades de todos sus ítems
  const { data: items } = await sb.from('transfer_credit_items').select('id').eq('transfer_credit_id', id)
  const ids = (items ?? []).map((i: { id: string }) => i.id)
  if (ids.length) await sb.from('academic_grades').delete().in('external_id', ids)
  // A quién reponerle el registro: se lee antes del borrado en cascada.
  const { data: tc } = await sb.from('transfer_credits')
    .select('student_id, dest_program_id').eq('id', id).maybeSingle()
  const { error } = await sb.from('transfer_credits').delete().eq('id', id)  // cascade borra ítems
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Las asignaturas que la convalidación cubría vuelven al registro como
  // "No iniciada": el estudiante sigue matriculado y siguen siendo suyas.
  await reponerRegistroTrasBorrar(tc?.student_id ?? null, tc?.dest_program_id ?? null)
  return NextResponse.json({ ok: true })
}
