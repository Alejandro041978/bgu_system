import { Topbar } from '@/components/layout/topbar'
import { StudentStatusReport } from '@/components/reports/student-status-report'

export const revalidate = 0

export default function EstadoEstudiantesPage() {
  return (
    <>
      <Topbar title="Estado de estudiantes" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <StudentStatusReport />
        </div>
      </div>
    </>
  )
}
