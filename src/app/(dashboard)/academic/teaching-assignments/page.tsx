import { Topbar } from '@/components/layout/topbar'
import { TeachingAssignmentsManager } from '@/components/academic/teaching-assignments-manager'

export const revalidate = 0

export default function TeachingAssignmentsPage() {
  return (
    <>
      <Topbar title="Asignación Docente" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <TeachingAssignmentsManager />
        </div>
      </div>
    </>
  )
}
