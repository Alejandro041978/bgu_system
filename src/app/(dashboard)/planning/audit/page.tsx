import { Topbar } from '@/components/layout/topbar'
import { PlanAudit } from '@/components/planning/plan-audit'

export const revalidate = 0

export default function PlanAuditPage() {
  return (
    <>
      <Topbar title="Auditor de Planeamiento" subtitle="Consistencia entre los tres planes" />
      <div className="flex-1 p-6 overflow-auto"><div className="w-full"><PlanAudit /></div></div>
    </>
  )
}
