import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type KpiDefinition = {
  id: string
  employee_id: string
  metric_type: string
  target_value: number
  comparison: string
  employee: { email: string; zoho_agent_id: string | null; zoho_agent_email: string | null }
}

type Period = {
  id: string
  start_date: string
  end_date: string
}

async function calcMetric(
  supabase: ReturnType<typeof admin>,
  def: KpiDefinition,
  period: Period
): Promise<number | null> {
  // Usar zoho_agent_id si está disponible, si no caer a assignee_email
  const agentId = def.employee.zoho_agent_id
  const agentEmail = def.employee.zoho_agent_email ?? def.employee.email
  const start = period.start_date
  const end = period.end_date

  switch (def.metric_type) {
    case 'zoho_tickets_resolved': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('desk_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Closed', 'Resolved'])
        .gte('closed_time', start)
        .lte('closed_time', end + 'T23:59:59Z')
      query = agentId ? query.eq('assignee_id', agentId) : query.eq('assignee_email', agentEmail)
      const { count } = await query
      return count ?? 0
    }

    case 'zoho_resolution_time': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('desk_tickets')
        .select('zoho_created_at, closed_time')
        .in('status', ['Closed', 'Resolved'])
        .gte('closed_time', start)
        .lte('closed_time', end + 'T23:59:59Z')
        .not('closed_time', 'is', null)
      query = agentId ? query.eq('assignee_id', agentId) : query.eq('assignee_email', agentEmail)
      const { data } = await query
      if (!data || data.length === 0) return null
      const hours = (data as { zoho_created_at: string; closed_time: string }[])
        .map(r => (new Date(r.closed_time).getTime() - new Date(r.zoho_created_at).getTime()) / 3600000)
        .filter(h => h >= 0)
      if (hours.length === 0) return null
      const avg = hours.reduce((s, h) => s + h, 0) / hours.length
      return Math.round(avg * 10) / 10
    }

    case 'zoho_satisfaction': {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ratings } = await (supabase as any)
        .from('desk_happiness_ratings')
        .select('rating')
        .eq('agent_id', agentId)
        .gte('rated_time', start)
        .lte('rated_time', end + 'T23:59:59Z')
      if (!ratings || ratings.length === 0) return null
      const good = (ratings as { rating: string }[]).filter(r => r.rating === 'GOOD').length
      return Math.round((good / ratings.length) * 1000) / 10
    }

    case 'manual':
      // El valor manual ya está guardado en kpi_results.current_value; no recalcular
      return null

    default:
      return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { periodId } = await params
    const supabase = admin()

    // Obtener período
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: period, error: pErr } = await (supabase as any)
      .from('kpi_periods')
      .select('*')
      .eq('id', periodId)
      .single()
    if (pErr || !period) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 })

    // Obtener todas las definiciones del período con email del empleado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defs, error: dErr } = await (supabase as any)
      .from('kpi_definitions')
      .select('*, employee:hr_employees(email, zoho_agent_id, zoho_agent_email)')
      .eq('period_id', periodId)
    if (dErr) throw new Error(dErr.message)

    let updated = 0
    for (const def of (defs as KpiDefinition[])) {
      if (def.metric_type === 'manual') continue

      const value = await calcMetric(supabase, def, period as Period)
      if (value === null) continue

      const met = def.comparison === 'lte'
        ? value <= def.target_value
        : value >= def.target_value

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('kpi_results')
        .upsert({
          period_id: periodId,
          employee_id: def.employee_id,
          kpi_definition_id: def.id,
          current_value: value,
          met,
          calculated_at: new Date().toISOString(),
        }, { onConflict: 'kpi_definition_id' })

      updated++
    }

    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    console.error('KPI calculate error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
