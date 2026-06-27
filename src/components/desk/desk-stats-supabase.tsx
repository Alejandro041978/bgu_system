import { Ticket, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

interface DeskStatsSupabaseProps {
  stats: { open: number; onHold: number; closed: number; overdue: number }
}

export function DeskStatsSupabase({ stats }: DeskStatsSupabaseProps) {
  const items = [
    { label: 'Tickets Abiertos', value: stats.open,   icon: Ticket,        color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'En Espera',        value: stats.onHold, icon: Clock,         color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Cerrados',         value: stats.closed, icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Vencidos',         value: stats.overdue,icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((s) => (
        <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
