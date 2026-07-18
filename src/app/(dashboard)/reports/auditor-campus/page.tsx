import { Topbar } from '@/components/layout/topbar'
import { CampusAudit } from '@/components/reports/campus-audit'

export const revalidate = 0

export default function AuditorCampusPage() {
  return (
    <>
      <Topbar title="Auditor del Campus" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <CampusAudit />
        </div>
      </div>
    </>
  )
}
