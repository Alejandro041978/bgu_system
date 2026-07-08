import { Topbar } from '@/components/layout/topbar'
import { ConvocatoriasManager } from '@/components/academic/convocatorias-manager'

export const revalidate = 0

export default function ConvocatoriasPage() {
  return (
    <>
      <Topbar title="Convocatorias" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <ConvocatoriasManager />
        </div>
      </div>
    </>
  )
}
