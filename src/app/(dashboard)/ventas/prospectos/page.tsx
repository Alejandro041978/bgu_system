import { Topbar } from '@/components/layout/topbar'
import { SalesLeadsView } from '@/components/sales/leads-view'

export const revalidate = 0

export default function ProspectosPage() {
  return (
    <>
      <Topbar title="Prospectos" subtitle="Embudo de ventas de Antonella" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <SalesLeadsView />
        </div>
      </div>
    </>
  )
}
