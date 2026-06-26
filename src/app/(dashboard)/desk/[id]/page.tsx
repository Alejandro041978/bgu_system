import { Topbar } from '@/components/layout/topbar'
import { TicketDetail } from '@/components/desk/ticket-detail'
import { getTicket, getTicketConversations } from '@/lib/zoho/client'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TicketPage({ params }: PageProps) {
  const { id } = await params

  const [ticket, conversations] = await Promise.all([
    getTicket(id).catch(() => null),
    getTicketConversations(id).catch(() => ({ data: [] })),
  ])

  if (!ticket) {
    notFound()
  }

  return (
    <>
      <Topbar
        title={`Ticket #${ticket.ticketNumber}`}
        subtitle={ticket.subject}
      />
      <div className="flex-1 p-6 overflow-auto">
        <TicketDetail ticket={ticket} conversations={conversations.data} />
      </div>
    </>
  )
}
