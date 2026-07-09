import { Topbar } from '@/components/layout/topbar'
import { ActaDetalle } from '@/components/academic/acta-detalle'

export const revalidate = 0

export default function ActaDetallePage() {
  return (
    <>
      <Topbar title="Acta Detallada" subtitle="Calificaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <ActaDetalle />
        </div>
      </div>
    </>
  )
}
