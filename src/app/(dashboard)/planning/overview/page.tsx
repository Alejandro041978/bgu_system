import { Topbar } from '@/components/layout/topbar'
import { PlanningOverview } from '@/components/planning/overview'

export const revalidate = 0

export default function PlanningOverviewPage() {
  return (
    <>
      <Topbar title="Panorama de Planeamiento" subtitle="Los tres planes institucionales en un solo tablero" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <PlanningOverview />
        </div>
      </div>
    </>
  )
}
