import { Topbar } from '@/components/layout/topbar'
import { CollectionBackfill } from '@/components/academic/collection-backfill'

export const revalidate = 0

export default function CollectionBackfillPage() {
  return (
    <>
      <Topbar title="Colección de aulas por matrícula" subtitle="Completar la colección de quienes no la tienen, con el criterio a la vista" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <CollectionBackfill />
        </div>
      </div>
    </>
  )
}
