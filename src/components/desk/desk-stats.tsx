import { Ticket, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { ZohoTicket } from '@/types/zoho'

interface DeskStatsProps {
  tickets: ZohoTicket[]
}

export function DeskStats({ tickets }: DeskStatsProps) {
  const open = tickets.filter(t => t.statusType === 'open').length
  const onHold = tickets.filter(t => t.statusType === 'on_hold').length
  const closed = tickets.filter(t => t.statusType === 'closed').length
  const overdue = tickets.filter(t => t.isOverdue).length

  const stats = [
    { label: 'Tickets Abiertos', value: open, icon: Ticket, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'En Espera', value: onHold, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Cerrados', value: closed, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Vencidos', value: overdue, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.bg}`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
