import { Topbar } from '@/components/layout/topbar'
import { GradesReport } from '@/components/reports/grades-report'

export const revalidate = 0

export default function GradesReportPage() {
  return (
    <>
      <Topbar title="Reporte de calificaciones" subtitle="Notas por categoría, programa, asignatura y periodo" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <GradesReport />
        </div>
      </div>
    </>
  )
}
