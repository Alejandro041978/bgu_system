import { Topbar } from '@/components/layout/topbar'
import { ScopedGrades } from '@/components/academic/scoped-grades'
import { CapstoneCourses } from '@/components/academic/capstone-courses'

export const revalidate = 0

export default function CapstoneGradesPage() {
  return (
    <>
      <Topbar title="Notas de Capstone" subtitle="Calificaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          <ScopedGrades
            endpoint="/api/academic/capstone-grades"
            explica="El capstone se defiende, no se rinde en el aula. El aula acompaña y da acceso; la nota sale de la defensa y se registra aquí."
          />
          <CapstoneCoursesSection />
        </div>
      </div>
    </>
  )
}

// El selector de alcance vive al final de la página y solo responde al
// superadministrador: el endpoint lo rechaza a cualquier otro, así que el
// bloque simplemente no se dibuja para quien gestiona las notas.
function CapstoneCoursesSection() {
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-800">
        Qué asignaturas son capstone
      </summary>
      <div className="mt-4"><CapstoneCourses /></div>
    </details>
  )
}
