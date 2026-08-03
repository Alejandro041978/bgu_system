import { Topbar } from '@/components/layout/topbar'
import { MoodleStatus } from '@/components/reports/moodle-status'

export const revalidate = 0

export default function MoodleStatusPage() {
  return (
    <>
      <Topbar title="Estado del Campus" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <MoodleStatus />
        </div>
      </div>
    </>
  )
}
