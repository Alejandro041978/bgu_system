import { Topbar } from '@/components/layout/topbar'
import { FlywireAudit } from '@/components/finance/flywire-audit'

export const revalidate = 0

export default function FlywireAuditPage() {
  return (
    <>
      <Topbar title="Flywire · Cuadre de importes" subtitle="Todo lo que Flywire entregó, contrastado contra el estado de cuenta" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <FlywireAudit />
        </div>
      </div>
    </>
  )
}
