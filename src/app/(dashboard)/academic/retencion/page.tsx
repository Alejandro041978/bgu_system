import { Topbar } from '@/components/layout/topbar'
import { WithdrawalRequestsView } from '@/components/academic/withdrawal-requests-view'

export const revalidate = 0

export default function RetencionPage() {
  return (
    <>
      <Topbar title="Retención" subtitle="Solicitudes de retiro: llamada humana y resultado" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <WithdrawalRequestsView />
        </div>
      </div>
    </>
  )
}
