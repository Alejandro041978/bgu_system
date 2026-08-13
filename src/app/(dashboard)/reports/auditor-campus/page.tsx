import { Topbar } from '@/components/layout/topbar'
import { CampusAudit } from '@/components/reports/campus-audit'
import { CampusAuditExclusions } from '@/components/reports/campus-audit-exclusions'

export const revalidate = 0

export default function AuditorCampusPage() {
  return (
    <>
      <Topbar title="Auditor del Campus" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full space-y-8">
          <CampusAudit />
          {/* Plegado: es configuración, no el trabajo del día. Pero está en la
              misma página a propósito —quien lee la auditoría tiene que poder
              ver qué quedó fuera sin ir a buscarlo. */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-800">
              Categorías fuera de la auditoría
            </summary>
            <div className="mt-4 max-w-3xl"><CampusAuditExclusions /></div>
          </details>
        </div>
      </div>
    </>
  )
}
