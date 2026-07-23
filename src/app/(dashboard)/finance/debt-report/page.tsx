import { Topbar } from '@/components/layout/topbar'
import { DebtReport } from '@/components/finance/debt-report'

export const revalidate = 0

export default function DebtReportPage() {
  return (
    <>
      <Topbar title="Reporte de Deuda" subtitle="Cuotas, pagos y morosidad por categoría de programa" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <DebtReport />
        </div>
      </div>
    </>
  )
}
