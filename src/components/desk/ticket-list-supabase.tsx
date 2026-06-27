import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SupabaseTicket {
  id: string
  ticket_number: string | null
  subject: string
  status: string
  status_type: string | null
  priority: string
  channel: string | null
  department_name: string | null
  contact_name: string | null
  assignee_name: string | null
  is_overdue: boolean
  zoho_created_at: string
  closed_time: string | null
  due_date: string | null
}

interface Props {
  tickets: SupabaseTicket[]
  totalCount: number
  page: number
  limit: number
}

function StatusBadge({ status, statusType }: { status: string; statusType: string | null }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium'
  if (statusType === 'closed') return <span className={`${base} bg-green-100 text-green-700`}>{status}</span>
  if (statusType === 'on_hold') return <span className={`${base} bg-yellow-100 text-yellow-700`}>{status}</span>
  return <span className={`${base} bg-blue-100 text-blue-700`}>{status}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium'
  if (priority === 'Urgent' || priority === 'High') return <span className={`${base} bg-red-100 text-red-700`}>{priority}</span>
  if (priority === 'Medium') return <span className={`${base} bg-orange-100 text-orange-700`}>{priority}</span>
  return <span className={`${base} bg-gray-100 text-gray-600`}>{priority}</span>
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}m`
  return `${Math.floor(months / 12)}a`
}

export function TicketListSupabase({ tickets, totalCount, page, limit }: Props) {
  const totalPages = Math.ceil(totalCount / limit)

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-sm">No se encontraron tickets con los filtros seleccionados.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-500">{totalCount.toLocaleString()} tickets</p>
        <p className="text-xs text-gray-400">Página {page} de {totalPages}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Asunto</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prioridad</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Asignado</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-6 py-3">
                  <span className="text-xs font-mono text-gray-400">{t.ticket_number ?? t.id.slice(-6)}</span>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <p className="font-medium text-gray-900 truncate">{t.subject}</p>
                  {t.is_overdue && (
                    <span className="text-xs text-red-500 font-medium">Vencido</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-600 text-sm">{t.contact_name ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} statusType={t.status_type} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-600 text-sm">{t.assignee_name ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-400 text-xs">{timeAgo(t.zoho_created_at)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <Link
            href={`/desk?page=${page - 1}`}
            className={`flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </Link>
          <Link
            href={`/desk?page=${page + 1}`}
            className={`flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
