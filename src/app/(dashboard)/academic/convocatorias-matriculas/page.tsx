import { Topbar } from '@/components/layout/topbar'
import { ConvocatoriasReport } from '@/components/academic/convocatorias-report'

export const revalidate = 0

export default function ConvocatoriasMatriculasPage() {
  return (
    <>
      <Topbar title="Matrículas por Convocatoria" subtitle="Comercial" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <ConvocatoriasReport />
        </div>
      </div>
    </>
  )
}
