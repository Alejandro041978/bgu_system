import { Topbar } from '@/components/layout/topbar'
import { GradesExplorer } from '@/components/academic/grades-explorer'

export const revalidate = 0

export default function AcademicGradesPage() {
  return (
    <>
      <Topbar title="Notas de Estudiantes" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <GradesExplorer />
        </div>
      </div>
    </>
  )
}
