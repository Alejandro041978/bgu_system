import { Topbar } from '@/components/layout/topbar'
import { ClassroomLinksTabs } from '@/components/academic/classroom-links-tabs'

export const revalidate = 0

export default function ClassroomLinksPage() {
  return (
    <>
      <Topbar title="Vinculación de Aulas" subtitle="Calificaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <ClassroomLinksTabs />
        </div>
      </div>
    </>
  )
}
