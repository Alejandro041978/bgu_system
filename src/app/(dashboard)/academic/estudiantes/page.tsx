import { Topbar } from '@/components/layout/topbar'
import { StudentProfile } from '@/components/academic/student-profile'

export const revalidate = 0

export default function EstudiantesPage() {
  return (
    <>
      <Topbar title="Ficha del Estudiante" subtitle="Académico" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <StudentProfile />
        </div>
      </div>
    </>
  )
}
