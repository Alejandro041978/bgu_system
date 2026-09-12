import { Topbar } from '@/components/layout/topbar'
import { RetakesManager } from '@/components/academic/retakes-manager'

export const revalidate = 0

export default function RetakesPage() {
  return (
    <>
      <Topbar title="Recursados" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <RetakesManager />
        </div>
      </div>
    </>
  )
}
