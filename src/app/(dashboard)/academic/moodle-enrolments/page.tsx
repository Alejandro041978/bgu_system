import { Topbar } from '@/components/layout/topbar'
import { MoodleEnrolmentsView } from '@/components/academic/moodle-enrolments-view'

export const revalidate = 0

export default function MoodleEnrolmentsPage() {
  return (
    <>
      <Topbar title="Aulas en Moodle" subtitle="Qué accesos tiene el estudiante en el campus virtual: aulas activas, suspendidas y anomalías frente a su carrusel" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <MoodleEnrolmentsView />
        </div>
      </div>
    </>
  )
}
