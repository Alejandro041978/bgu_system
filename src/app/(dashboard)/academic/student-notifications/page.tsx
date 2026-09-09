import { Topbar } from '@/components/layout/topbar'
import { StudentNotificationsView } from '@/components/academic/student-notifications-view'

export const revalidate = 0

export default function StudentNotificationsPage() {
  return (
    <>
      <Topbar title="Notificaciones" subtitle="Todo lo que el ERP le ha notificado al estudiante: qué, cuándo, a qué correos y si llegó" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <StudentNotificationsView />
        </div>
      </div>
    </>
  )
}
