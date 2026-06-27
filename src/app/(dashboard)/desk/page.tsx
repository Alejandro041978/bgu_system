import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { TicketFiltersBar } from '@/components/desk/ticket-filters-bar'
import { DeskStatsSupabase } from '@/components/desk/desk-stats-supabase'
import { TicketListSupabase } from '@/components/desk/ticket-list-supabase'

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
  const from = (page - 1) * limit

  const supabase = await createClient()

  let query = supabase
    .from('desk_tickets')
    .select('id, ticket_number, subject, status, status_type, priority, channel, department_name, contact_name, assignee_name, assignee_id, is_overdue, zoho_created_at, closed_time, due_date', { count: 'exact' })
    .order('zoho_created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (params.status && params.status !== 'all') {
    query = query.eq('status_type', params.status)
  }
  if (params.priority && params.priority !== 'all') {
    query = query.eq('priority', params.priority)
  }
  if (params.department && params.department !== 'all') {
    query = query.eq('department_name', params.department)
  }
  if (params.search) {
    query = query.or(`subject.ilike.%${params.search}%,contact_name.ilike.%${params.search}%,ticket_number.ilike.%${params.search}%`)
  }

  const { data: tickets, count } = await query

  const [openRes, holdRes, closedRes, overdueRes, deptsRes] = await Promise.all([
    supabase.from('desk_tickets').select('id', { count: 'exact', head: true }).eq('status_type', 'open'),
    supabase.from('desk_tickets').select('id', { count: 'exact', head: true }).eq('status_type', 'on_hold'),
    supabase.from('desk_tickets').select('id', { count: 'exact', head: true }).eq('status_type', 'closed'),
    supabase.from('desk_tickets').select('id', { count: 'exact', head: true }).eq('is_overdue', true),
    supabase.from('desk_tickets').select('department_name').not('department_name', 'is', null),
  ])

  const stats = {
    open: openRes.count ?? 0,
    onHold: holdRes.count ?? 0,
    closed: closedRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
  }

  const departments = [
    ...new Set(
      (deptsRes.data ?? [])
        .map((r: { department_name: string | null }) => r.department_name)
        .filter(Boolean)
    ),
  ] as string[]

  return (
    <>
      <Topbar title="Atención al Cliente" subtitle="Tickets de Zoho Desk" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <DeskStatsSupabase stats={stats} />
        <TicketFiltersBar departments={departments.map(d => ({ id: d, name: d }))} />
        <TicketListSupabase
          tickets={tickets ?? []}
          totalCount={count ?? 0}
          page={page}
          limit={limit}
        />
      </div>
    </>
  )
}
