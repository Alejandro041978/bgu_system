import { Topbar } from '@/components/layout/topbar'
import { EffectivenessKPICatalog } from '@/components/planning/effectiveness-kpi-catalog'

export const revalidate = 0

export default function EffectivenessKPIsPage() {
  return (
    <>
      <Topbar title="KPIs · Plan de Efectividad" subtitle="Catálogo de indicadores" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <EffectivenessKPICatalog />
        </div>
      </div>
    </>
  )
}
