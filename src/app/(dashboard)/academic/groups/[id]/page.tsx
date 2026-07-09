import { Topbar } from '@/components/layout/topbar'
import { GroupDetail } from '@/components/academic/group-detail'

export const revalidate = 0

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <Topbar title="Detalle del Grupo" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <GroupDetail groupId={id} />
        </div>
      </div>
    </>
  )
}
