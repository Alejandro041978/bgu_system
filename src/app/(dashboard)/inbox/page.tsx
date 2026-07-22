import { Topbar } from '@/components/layout/topbar'
import { InboxView } from '@/components/inbox/inbox-view'

export const revalidate = 0

export default function InboxPage() {
  return (
    <>
      <Topbar title="Bandeja Helpdesk" subtitle="Servicio al Estudiante" />
      <div className="flex-1 p-6 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full">
          <InboxView />
        </div>
      </div>
    </>
  )
}
