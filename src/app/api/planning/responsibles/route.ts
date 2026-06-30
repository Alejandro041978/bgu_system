import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = db()
  const years: number[] = Array.isArray(body.years) ? body.years : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('strategic_action_responsibles')
    .insert({
      action_id: body.action_id, employee_id: body.employee_id,
      role: body.role ?? 'principal', assigned_from_year: body.assigned_from_year,
      code: body.code ?? null, name: body.name ?? null,
      status: 'active', progress_pct: 0,
    })
    .select('id, role, assigned_from_year, assigned_to_year, code, name, status, progress_pct, notes, employee:hr_employees(id, full_name, position)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (years.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('strategic_responsible_years')
      .insert(years.map(y => ({ responsible_id: data.id, year: y })))
  }

  return NextResponse.json({ ...data, years: years.sort((a, b) => a - b) })
}
