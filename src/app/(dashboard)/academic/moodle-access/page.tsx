import { Topbar } from '@/components/layout/topbar'
import { MoodleAccess } from '@/components/academic/moodle-access'

export const revalidate = 0

export default function MoodleAccessPage() {
  return (
    <>
      <Topbar title="Acceso a Moodle" subtitle="Restricción por deuda vencida y excepciones temporales" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <MoodleAccess />
        </div>
      </div>
    </>
  )
}
