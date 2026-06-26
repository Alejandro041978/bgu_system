import Link from 'next/link'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ZohoTicket } from '@/types/zoho'
import { cn, timeAgo, getPriorityColor, getStatusColor } from '@/lib/utils'

interface TicketListProps {
  tickets: ZohoTicket[]
  totalCount: number
  page: number
  limit: number
}

export function TicketList({ tickets, totalCount, page, limit }: TicketListProps) {
  const totalPages = Math.ceil(totalCount / limit)
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, totalCount)

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-sm">No se encontraron tickets con los filtros seleccionados.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Mostrando <span className="font-medium text-gray-900">{from}–{to}</span> de{' '}
          <span className="font-medium text-gray-900">{totalCount}</span> tickets
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {tickets.map((ticket) => (
          <Link
            key={ticket.id}
            href={`/desk/${ticket.id}`}
            className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-gray-400">#{ticket.ticketNumber}</span>
                {ticket.isOverdue && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="w-3 h-3" />
                    Vencido
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                {ticket.subject}
              </p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {ticket.contactName && (
                  <span className="text-xs text-gray-500">{ticket.contactName}</span>
                )}
                {ticket.departmentName && (
                  <span className="text-xs text-gray-400">· {ticket.departmentName}</span>
                )}
                {ticket.assigneeName && (
                  <span className="text-xs text-gray-400">· Asignado: {ticket.assigneeName}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-full border',
                getPriorityColor(ticket.priority)
              )}>
                {ticket.priority}
              </span>
              <span className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-full border',
                getStatusColor(ticket.status)
              )}>
                {ticket.status}
              </span>
              <span className="text-xs text-gray-400 w-20 text-right">
                {timeAgo(ticket.modifiedTime)}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <Link
            href={`?page=${page - 1}`}
            className={cn(
              'flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors',
              page <= 1
                ? 'text-gray-300 pointer-events-none'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </Link>
          <span className="text-sm text-gray-500">
            Página {page} de {totalPages}
          </span>
          <Link
            href={`?page=${page + 1}`}
            className={cn(
              'flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors',
              page >= totalPages
                ? 'text-gray-300 pointer-events-none'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
