import { Topbar } from '@/components/layout/topbar'
import { InboxMetrics } from '@/components/inbox/inbox-metrics'

export const revalidate = 0

export default function InboxMetricsPage() {
  return (
    <>
      <Topbar title="Buzón · Métricas" subtitle="Servicio al Estudiante" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <InboxMetrics />
        </div>
      </div>
    </>
  )
}
