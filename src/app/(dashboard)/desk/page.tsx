import { Topbar } from '@/components/layout/topbar'
import { TicketList } from '@/components/desk/ticket-list'
import { TicketFiltersBar } from '@/components/desk/ticket-filters-bar'
import { DeskStats } from '@/components/desk/desk-stats'
import { getTickets, getDepartments } from '@/lib/zoho/client'
import type { TicketFilters } from '@/types/zoho'

interface PageProps {
  searchParams: Promise<{
    status?: string
    priority?: string
    department?: string
    search?: string
    page?: string
  }>
}

export default async function DeskPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const limit = 25

  const filters: TicketFilters = {
    status: (params.status as TicketFilters['status']) ?? 'all',
    priority: (params.priority as TicketFilters['priority']) ?? 'all',
    department: params.department,
    search: params.search,
    from: (page - 1) * limit,
    limit,
    sortBy: 'modifiedTime',
    sortOrder: 'desc',
  }

  const [ticketsData, departmentsData] = await Promise.all([
    getTickets(filters).catch(() => ({ data: [], info: { totalCount: 0, count: 0, from: 0, limit } })),
    getDepartments().catch(() => ({ data: [] })),
  ])

  return (
    <>
      <Topbar
        title="Atención al Cliente"
        subtitle="Tickets de Zoho Desk"
      />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <DeskStats tickets={ticketsData.data} />
        <TicketFiltersBar departments={departmentsData.data} />
        <TicketList
          tickets={ticketsData.data}
          totalCount={ticketsData.info.totalCount}
          page={page}
          limit={limit}
        />
      </div>
    </>
  )
}
