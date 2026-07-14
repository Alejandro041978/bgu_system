import { Topbar } from '@/components/layout/topbar'
import { StudentTrackingView } from '@/components/academic/student-tracking-view'

export const revalidate = 0

export default function SeguimientoPage() {
  return (
    <>
      <Topbar title="Seguimiento estudiantil" subtitle="Deuda, conexiones y riesgo de deserción" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <StudentTrackingView />
        </div>
      </div>
    </>
  )
}
