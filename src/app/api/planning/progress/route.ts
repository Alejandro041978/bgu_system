import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPlanning } from '@/lib/planning-guard'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Avance anual POR ACCIÓN ESTRATÉGICA (la unidad de reporte desde el
// 10/09/2026 — las actividades por responsable se retiraron). Un reporte por
// acción y año: si hay que corregirlo, se edita o se elimina, no se duplica.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const actionId = req.nextUrl.searchParams.get('action_id')
  if (!actionId) return NextResponse.json({ error: 'action_id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('strategic_action_progress')
    .select('id, year, status, progress_pct, notes, reported_at, reported_by:hr_employees(id, full_name)')
    .eq('action_id', actionId)
    .order('year', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPlanning()
  if (noAutorizado) return noAutorizado

  const body = await req.json()
  const supabase = db()

  // El año reportado debe ser un año de ejecución de la acción (si están
  // definidos): reportar 2027 sobre una acción de 2024-2025 es un error de
  // captura, no un avance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowedYears } = await (supabase as any)
    .from('strategic_action_years').select('year').eq('action_id', body.action_id)
  if (allowedYears && allowedYears.length > 0) {
    const ok = allowedYears.some((y: { year: number }) => y.year === Number(body.year))
    if (!ok) return NextResponse.json({ error: `El año ${body.year} no está habilitado para esta acción. Años permitidos: ${allowedYears.map((y: { year: number }) => y.year).join(', ')}` }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('strategic_action_progress')
    .insert({
      action_id: body.action_id, year: body.year,
      status: body.status ?? 'active', progress_pct: body.progress_pct ?? 0,
      notes: body.notes ?? null, reported_by: body.reported_by ?? null,
    })
    .select('id, year, status, progress_pct, notes, reported_at, reported_by:hr_employees(id, full_name)')
    .single()
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: `El año ${body.year} ya tiene un avance reportado para esta acción: edítalo o elimínalo en vez de duplicarlo.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
