import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const capacitacionId = req.nextUrl.searchParams.get('capacitacion_id')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db() as any

  let query = sb
    .from('capacitacion_participantes')
    .select('id, capacitacion_id, employee_id, created_at')
    .order('created_at', { ascending: true })

  if (capacitacionId) query = query.eq('capacitacion_id', capacitacionId)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with employee names
  const empIds = [...new Set((rows ?? []).map((r: { employee_id: string }) => r.employee_id))]
  const empMap: Record<string, { full_name: string; position?: string }> = {}
  if (empIds.length > 0) {
    const { data: emps } = await sb.from('hr_employees').select('id, full_name, position').in('id', empIds)
    for (const e of emps ?? []) empMap[e.id] = e
  }

  const enriched = (rows ?? []).map((r: { id: string; capacitacion_id: string; employee_id: string; created_at: string }) => ({
    ...r,
    employee: empMap[r.employee_id] ?? null,
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { capacitacion_id: string; employee_id: string }
  if (!body.capacitacion_id || !body.employee_id) {
    return NextResponse.json({ error: 'capacitacion_id y employee_id requeridos' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('capacitacion_participantes')
    .insert({ capacitacion_id: body.capacitacion_id, employee_id: body.employee_id })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'El colaborador ya está registrado en esta capacitación' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('capacitacion_participantes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
