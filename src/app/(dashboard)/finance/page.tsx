import { Topbar } from '@/components/layout/topbar'
import { FinanceDashboard } from '@/components/finance/finance-dashboard'

export const revalidate = 0

export default function FinancePage() {
  return (
    <>
      <Topbar title="Contabilidad" subtitle="Finanzas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <FinanceDashboard />
        </div>
      </div>
    </>
  )
}
