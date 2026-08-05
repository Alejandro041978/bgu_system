import { Topbar } from '@/components/layout/topbar'
import { SyllabiView } from '@/components/academic/syllabi-view'

export const revalidate = 0

export default function SyllabiPage() {
  return (
    <>
      <Topbar title="Sílabos" subtitle="Sílabo vigente e histórico de cada asignatura" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <SyllabiView />
        </div>
      </div>
    </>
  )
}
