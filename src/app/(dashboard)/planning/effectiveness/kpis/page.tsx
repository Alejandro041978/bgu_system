import { Topbar } from '@/components/layout/topbar'
import { EffectivenessKPICatalog } from '@/components/planning/effectiveness-kpi-catalog'

export const revalidate = 0

export default function EffectivenessKPIsPage() {
  return (
    <>
      <Topbar title="Catálogo de KPIs" subtitle="Planeamiento · indicadores institucionales y su pertenencia a los tres planes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <EffectivenessKPICatalog />
        </div>
      </div>
    </>
  )
}
