import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const responsibleId = req.nextUrl.searchParams.get('responsible_id')
  if (!responsibleId) return NextResponse.json({ error: 'responsible_id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_responsible_progress')
    .select('id, year, status, progress_pct, notes, reported_at, reported_by:hr_employees(id, full_name)')
    .eq('responsible_id', responsibleId)
    .order('year', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = db()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowedYears } = await (supabase as any)
    .from('strategic_responsible_years').select('year').eq('responsible_id', body.responsible_id)
  if (allowedYears && allowedYears.length > 0) {
    const ok = allowedYears.some((y: { year: number }) => y.year === Number(body.year))
    if (!ok) return NextResponse.json({ error: `El año ${body.year} no está habilitado para esta acción. Años permitidos: ${allowedYears.map((y: { year: number }) => y.year).join(', ')}` }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('strategic_responsible_progress')
    .insert({
      responsible_id: body.responsible_id, year: body.year,
      status: body.status ?? 'active', progress_pct: body.progress_pct ?? 0,
      notes: body.notes ?? null, reported_by: body.reported_by ?? null,
    })
    .select('id, year, status, progress_pct, notes, reported_at, reported_by:hr_employees(id, full_name)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
