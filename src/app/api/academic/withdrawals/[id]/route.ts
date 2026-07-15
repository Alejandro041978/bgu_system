import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb, recomputeSituations } from '@/lib/withdrawals'

export const maxDuration = 120

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// PATCH → reincorporar un LOA, editar notas/fechas, corregir la resolución
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Cuerpo requerido' }, { status: 400 })

  // Sólo estos campos son editables
  const allowed = ['status', 'resolution_number', 'withdrawal_date', 'expires_at', 'reason', 'note']
  const patch: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) patch[k] = body[k]
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

  const sb = wdb()
  const { error } = await sb.from('student_withdrawals').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recomputeSituations(sb)
  return NextResponse.json({ ok: true })
}

// DELETE → anular un registro mal creado
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = wdb()
  const { error } = await sb.from('student_withdrawals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recomputeSituations(sb)
  return NextResponse.json({ ok: true })
}
