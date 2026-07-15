import { Topbar } from '@/components/layout/topbar'
import { WithdrawalsView } from '@/components/academic/withdrawals-view'

export const revalidate = 0

export default function RetirosPage() {
  return (
    <>
      <Topbar title="Retiros" subtitle="IW (definitivos) y LOA (temporales)" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <WithdrawalsView />
        </div>
      </div>
    </>
  )
}
