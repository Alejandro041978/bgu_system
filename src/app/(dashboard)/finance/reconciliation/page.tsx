import { Topbar } from '@/components/layout/topbar'
import { PaymentReconciliation } from '@/components/finance/payment-reconciliation'

export const revalidate = 0

export default function ReconciliationPage() {
  return (
    <>
      <Topbar title="Auditor de Conciliación" subtitle="Pagos de SystemActiva contrastados contra los ZBL de las importaciones de Flywire" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <PaymentReconciliation />
        </div>
      </div>
    </>
  )
}
