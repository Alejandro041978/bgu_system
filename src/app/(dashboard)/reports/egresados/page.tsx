import { Topbar } from '@/components/layout/topbar'
import { GraduatesReport } from '@/components/reports/graduates-report'

export const revalidate = 0

export default function EgresadosPage() {
  return (
    <>
      <Topbar title="Egresados" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <GraduatesReport />
        </div>
      </div>
    </>
  )
}
