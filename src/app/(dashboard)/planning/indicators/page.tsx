import { Topbar } from '@/components/layout/topbar'
import { PlanIndicators } from '@/components/planning/plan-indicators'

export const revalidate = 0

export default function PlanIndicatorsPage() {
  return (
    <>
      <Topbar title="Tablero de Indicadores" subtitle="Plan Estratégico" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <PlanIndicators />
        </div>
      </div>
    </>
  )
}
