import { Topbar } from '@/components/layout/topbar'
import { DegreesControl } from '@/components/registrar/degrees-control'

export const revalidate = 0

export default function DegreesPage() {
  return (
    <>
      <Topbar title="Degrees · Hoja de Control" subtitle="Emisión, apostillado y entrega de títulos (reemplaza el Excel de Registros)" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <DegreesControl />
        </div>
      </div>
    </>
  )
}
