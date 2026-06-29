import { Users, CheckCircle2, Briefcase, Handshake, Globe } from 'lucide-react'

interface Props {
  total: number
  active: number
  direct: number
  contractors: number
  external: number
}

export function HRStatsBar({ total, active, direct, contractors, external }: Props) {
  const stats = [
    { label: 'Total colaboradores', value: total, icon: Users, color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Contratos activos', value: active, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Empleados directos', value: direct, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Contratistas', value: contractors, icon: Handshake, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Externos', value: external, icon: Globe, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="flex gap-3 flex-wrap">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 min-w-36">
          <div className={`p-2 rounded-lg ${s.bg}`}>
            <s.icon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
