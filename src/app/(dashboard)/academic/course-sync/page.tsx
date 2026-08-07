import { Topbar } from '@/components/layout/topbar'
import { CourseSyncView } from '@/components/academic/course-sync-view'

export const revalidate = 0

export default function CourseSyncPage() {
  return (
    <>
      <Topbar title="Sincronizar asignatura" subtitle="Trae las notas de Moodle de una asignatura al instante" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <p className="text-xs text-gray-500">
            El cron recorre las 585 aulas vinculadas por tandas y tarda unas 14 horas en dar la vuelta.
            Aquí eliges una asignatura y se importan <strong>todas sus aulas</strong> en el momento.
          </p>
          <CourseSyncView />
        </div>
      </div>
    </>
  )
}
