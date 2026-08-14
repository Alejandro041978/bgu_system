import { Topbar } from '@/components/layout/topbar'
import { StudentAudit } from '@/components/students/student-audit'

export const revalidate = 0

export default function CambiosEnFichasPage() {
  return (
    <>
      <Topbar title="Cambios en las Fichas" subtitle="Académico" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <StudentAudit />
        </div>
      </div>
    </>
  )
}
