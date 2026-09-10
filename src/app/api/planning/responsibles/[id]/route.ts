import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const { id } = await params
  const body = await req.json()
  // La asignación solo tiene rol que cambiar (10/09/2026): todo lo demás vive
  // en la acción o en su avance.
  const patch: Record<string, unknown> = {}
  if (body.role !== undefined) patch.role = body.role === 'apoyo' ? 'apoyo' : 'principal'
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_action_responsibles').update(patch).eq('id', id)
    .select('id, role, employee:hr_employees(id, full_name, position)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('strategic_action_responsibles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
