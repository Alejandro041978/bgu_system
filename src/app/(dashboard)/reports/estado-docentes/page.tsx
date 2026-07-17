import { Topbar } from '@/components/layout/topbar'
import { FacultyStatusReport } from '@/components/reports/faculty-status-report'

export const revalidate = 0

export default function EstadoDocentesPage() {
  return (
    <>
      <Topbar title="Estado de los docentes" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <FacultyStatusReport />
        </div>
      </div>
    </>
  )
}
