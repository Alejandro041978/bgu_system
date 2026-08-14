import { Topbar } from '@/components/layout/topbar'
import { ActaAudit } from '@/components/academic/acta-audit'

export const revalidate = 0

export default function ActaAuditPage() {
  return (
    <>
      <Topbar title="Auditor de Actas" subtitle="Calificaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <ActaAudit />
        </div>
      </div>
    </>
  )
}
