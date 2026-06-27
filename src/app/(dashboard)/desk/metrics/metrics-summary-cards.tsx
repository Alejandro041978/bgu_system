import { Ticket, CheckCircle, Star, ThumbsUp } from 'lucide-react'

interface Props {
  totalTickets: number
  totalClosed: number
  totalRatings: number
  globalCsat: number | null
}

export function MetricsSummaryCards({ totalTickets, totalClosed, totalRatings, globalCsat }: Props) {
  const cards = [
    {
      label: 'Tickets recibidos',
      value: totalTickets.toLocaleString(),
      icon: Ticket,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Tickets cerrados',
      value: totalClosed.toLocaleString(),
      sub: totalTickets ? `${Math.round((totalClosed / totalTickets) * 100)}% del total` : undefined,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Calificaciones recibidas',
      value: totalRatings.toLocaleString(),
      icon: Star,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'CSAT global',
      value: globalCsat !== null ? `${globalCsat}%` : '—',
      sub: 'Calificaciones "Bueno"',
      icon: ThumbsUp,
      color: globalCsat !== null && globalCsat >= 90 ? 'text-green-600' : globalCsat !== null && globalCsat >= 70 ? 'text-yellow-600' : 'text-red-600',
      bg: globalCsat !== null && globalCsat >= 90 ? 'bg-green-50' : globalCsat !== null && globalCsat >= 70 ? 'bg-yellow-50' : 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">{card.label}</p>
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          {card.sub && <p className="text-xs text-gray-400 mt-1">{card.sub}</p>}
        </div>
      ))}
    </div>
  )
}
