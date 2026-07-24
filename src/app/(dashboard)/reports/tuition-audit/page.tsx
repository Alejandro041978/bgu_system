import { Topbar } from '@/components/layout/topbar'
import { TuitionAudit } from '@/components/reports/tuition-audit'

export const revalidate = 0

export default function TuitionAuditPage() {
  return (
    <>
      <Topbar title="Auditoría de Tuition" subtitle="Lista − Transfer Credit Savings − Beca vs cuotas Tuition facturadas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <TuitionAudit />
        </div>
      </div>
    </>
  )
}
