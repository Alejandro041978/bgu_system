import { createClient } from '@/lib/supabase/server'
import { MetricsFilters } from './metrics-filters'
import { AgentMetricsTable } from './agent-metrics-table'
import { MetricsSummaryCards } from './metrics-summary-cards'
import { BarChart3 } from 'lucide-react'

const AGENTS: Record<string, { name: string; email: string }> = {
  '1095985000000339097': { name: 'Adriana Masías',           email: 'adriana.masias@blackwell.university' },
  '1095985000000307659': { name: 'Claudia Quispe Llanos',    email: 'claudia.quispe@blackwell.university' },
  '1095985000000339061': { name: 'Fari Carrillo',            email: 'faridee.carrillo@neumann.education' },
  '1095985000013262447': { name: 'Patricia Najar Villanueva',email: 'patricia.najar@neumann.education' },
  '1095985000000307623': { name: 'Sara Morales Flores',      email: 'sara.morales@blackwell.university' },
  '1095985000000139001': { name: 'Alejandro Núñez Vizcarra', email: 'alejandro.nunez@blackwell.university' },
}

interface SearchParams { month?: string }

export default async function MetricsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { month } = await searchParams
  const supabase = await createClient()

  // Default to current month
  const now = new Date()
  const selectedMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, mon] = selectedMonth.split('-').map(Number)
  const monthStart = new Date(year, mon - 1, 1).toISOString()
  const monthEnd   = new Date(year, mon, 1).toISOString()

  // Tickets per agent this month
  const { data: ticketsRaw } = await supabase
    .from('desk_tickets')
    .select('assignee_id, closed_time, zoho_created_at')
    .gte('zoho_created_at', monthStart)
    .lt('zoho_created_at', monthEnd)
    .not('assignee_id', 'is', null)
  const tickets = (ticketsRaw ?? []) as { assignee_id: string; closed_time: string | null; zoho_created_at: string }[]

  // Happiness ratings this month
  const { data: ratingsRaw } = await supabase
    .from('desk_happiness_ratings')
    .select('agent_id, rating')
    .gte('rated_time', monthStart)
    .lt('rated_time', monthEnd)
  const ratings = (ratingsRaw ?? []) as { agent_id: string; rating: string }[]

  // Aggregate per agent
  const agentIds = Object.keys(AGENTS).filter(id => id !== '1095985000000139001')
  const metrics = agentIds.map(agentId => {
    const agentTickets = tickets.filter(t => t.assignee_id === agentId)
    const closed = agentTickets.filter(t => t.closed_time)
    const resolutionHours = closed.map(t => {
      const ms = new Date(t.closed_time!).getTime() - new Date(t.zoho_created_at).getTime()
      return ms / 3600000
    })
    const avgResolution = resolutionHours.length
      ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length
      : null

    const agentRatings = ratings.filter(r => r.agent_id === agentId)
    const good = agentRatings.filter(r => r.rating === 'GOOD').length
    const ok   = agentRatings.filter(r => r.rating === 'OK').length
    const bad  = agentRatings.filter(r => r.rating === 'BAD').length
    const csat = agentRatings.length ? Math.round((good / agentRatings.length) * 100) : null

    return {
      agentId,
      name: AGENTS[agentId].name,
      tickets: agentTickets.length,
      ticketsClosed: closed.length,
      avgResolutionHours: avgResolution ? Math.round(avgResolution * 10) / 10 : null,
      ratingsTotal: agentRatings.length,
      ratingsGood: good,
      ratingsOk: ok,
      ratingsBad: bad,
      csatPct: csat,
    }
  }).sort((a, b) => b.tickets - a.tickets)

  const totals = {
    tickets:  metrics.reduce((s, m) => s + m.tickets, 0),
    closed:   metrics.reduce((s, m) => s + m.ticketsClosed, 0),
    ratings:  metrics.reduce((s, m) => s + m.ratingsTotal, 0),
    csatGood: metrics.reduce((s, m) => s + m.ratingsGood, 0),
  }
  const globalCsat = totals.ratings ? Math.round((totals.csatGood / totals.ratings) * 100) : null

  // Available months (from ticket data range)
  const months: string[] = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Métricas por Agente</h1>
            <p className="text-sm text-gray-500">Rendimiento del equipo de atención al cliente</p>
          </div>
        </div>
        <MetricsFilters months={months} selectedMonth={selectedMonth} />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <MetricsSummaryCards
          totalTickets={totals.tickets}
          totalClosed={totals.closed}
          totalRatings={totals.ratings}
          globalCsat={globalCsat}
        />
        <AgentMetricsTable metrics={metrics} selectedMonth={selectedMonth} />
      </div>
    </div>
  )
}
