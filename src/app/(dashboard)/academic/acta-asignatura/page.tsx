import { Topbar } from '@/components/layout/topbar'
import { CourseReport } from '@/components/academic/course-report'

export const revalidate = 0

export default function ActaAsignaturaPage() {
  return (
    <>
      <Topbar title="Acta de Asignatura" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <CourseReport />
        </div>
      </div>
    </>
  )
}
