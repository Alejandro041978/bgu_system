import { Topbar } from '@/components/layout/topbar'
import { GroupsManager } from '@/components/academic/groups-manager'

export const revalidate = 0

export default function GroupsPage() {
  return (
    <>
      <Topbar title="Grupos" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <GroupsManager />
        </div>
      </div>
    </>
  )
}
