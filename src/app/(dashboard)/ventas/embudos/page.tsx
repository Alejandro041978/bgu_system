import { Topbar } from '@/components/layout/topbar'
import { FunnelsConfig } from '@/components/sales/funnels-config'

export const revalidate = 0

export default function FunnelsConfigPage() {
  return (
    <>
      <Topbar title="Configuración de embudos" subtitle="Ventas · embudos por bot y categoría/producto" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <FunnelsConfig />
        </div>
      </div>
    </>
  )
}
