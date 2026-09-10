import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const body = await req.json()
  // Asignación pura (10/09/2026): persona + rol sobre la ACCIÓN. La identidad
  // de "actividad" (código/nombre/años propios) se retiró — los años de
  // ejecución viven en la acción.
  const role = body.role === 'apoyo' ? 'apoyo' : 'principal'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_action_responsibles')
    .insert({
      action_id: body.action_id, employee_id: body.employee_id,
      role, assigned_from_year: body.assigned_from_year ?? new Date().getFullYear(),
      status: 'active', progress_pct: 0,
    })
    .select('id, role, employee:hr_employees(id, full_name, position)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
