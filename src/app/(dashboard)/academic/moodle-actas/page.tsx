import { Topbar } from '@/components/layout/topbar'
import { MoodleActasImport } from '@/components/academic/moodle-actas-import'

export const revalidate = 0

export default function MoodleActasPage() {
  return (
    <>
      <Topbar title="Actas de Moodle" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <MoodleActasImport />
        </div>
      </div>
    </>
  )
}
