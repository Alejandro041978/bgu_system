import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodId: string; employeeId: string }> }
) {
  const { periodId, employeeId } = await params
  const supabase = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('kpi_definitions')
    .select('*, result:kpi_results!kpi_results_kpi_definition_id_fkey(current_value, met, calculated_at)')
    .eq('period_id', periodId)
    .eq('employee_id', employeeId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string; employeeId: string }> }
) {
  const { periodId, employeeId } = await params
  const { kpi_definition_id, current_value } = await req.json() as {
    kpi_definition_id: string
    current_value: number
  }

  const supabase = admin()

  // Obtener definición para calcular met
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: def } = await (supabase as any)
    .from('kpi_definitions')
    .select('target_value, comparison')
    .eq('id', kpi_definition_id)
    .single()

  const met = def
    ? def.comparison === 'lte'
      ? current_value <= def.target_value
      : current_value >= def.target_value
    : false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('kpi_results')
    .upsert({
      period_id: periodId,
      employee_id: employeeId,
      kpi_definition_id,
      current_value,
      met,
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'kpi_definition_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, met })
}
