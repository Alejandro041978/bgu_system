import { Clock, ThumbsUp, ThumbsDown, Minus } from 'lucide-react'

interface AgentMetric {
  agentId: string
  name: string
  tickets: number
  ticketsClosed: number
  avgResolutionHours: number | null
  ratingsTotal: number
  ratingsGood: number
  ratingsOk: number
  ratingsBad: number
  csatPct: number | null
}

function CsatBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-sm">—</span>
  const color = pct >= 90 ? 'bg-green-100 text-green-700' : pct >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${color}`}>{pct}%</span>
}

function ResolutionTime({ hours }: { hours: number | null }) {
  if (hours === null) return <span className="text-gray-400 text-sm">—</span>
  if (hours < 1) return <span className="text-green-600 text-sm font-medium">{Math.round(hours * 60)}m</span>
  if (hours < 24) return <span className="text-blue-600 text-sm font-medium">{hours}h</span>
  return <span className="text-orange-600 text-sm font-medium">{(hours / 24).toFixed(1)}d</span>
}

export function AgentMetricsTable({ metrics, selectedMonth }: { metrics: AgentMetric[]; selectedMonth: string }) {
  const [year, mon] = selectedMonth.split('-').map(Number)
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const monthLabel = `${MONTHS[mon - 1]} ${year}`

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Rendimiento por asesora — {monthLabel}</h2>
        <p className="text-xs text-gray-400 mt-0.5">Tickets recibidos, tiempo de resolución y satisfacción del cliente</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Asesora</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tickets</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cerrados</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1"><Clock className="w-3 h-3" />Resolución</div>
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Calificaciones</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">CSAT</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {metrics.map((m, i) => (
              <tr key={m.agentId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {m.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <span className="font-medium text-gray-900">{m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-semibold text-gray-900">{m.tickets}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-medium text-gray-700">{m.ticketsClosed}</span>
                  {m.tickets > 0 && (
                    <span className="text-xs text-gray-400 ml-1">
                      ({Math.round((m.ticketsClosed / m.tickets) * 100)}%)
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-center">
                  <ResolutionTime hours={m.avgResolutionHours} />
                </td>
                <td className="px-4 py-4 text-center">
                  {m.ratingsTotal > 0 ? (
                    <span className="text-gray-700">{m.ratingsTotal}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-4 text-center">
                  <CsatBadge pct={m.csatPct} />
                </td>
                <td className="px-4 py-4">
                  {m.ratingsTotal > 0 ? (
                    <div className="flex items-center justify-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-green-600">
                        <ThumbsUp className="w-3 h-3" />{m.ratingsGood}
                      </span>
                      <span className="flex items-center gap-1 text-yellow-600">
                        <Minus className="w-3 h-3" />{m.ratingsOk}
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <ThumbsDown className="w-3 h-3" />{m.ratingsBad}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs text-center block">Sin calificaciones</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
