import { Topbar } from '@/components/layout/topbar'
import { NuevaMatricula } from '@/components/admision/nueva-matricula'

export const revalidate = 0

export default function NuevaMatriculaPage() {
  return (
    <>
      <Topbar title="Nueva Matrícula" subtitle="Comercial · Admisión" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <NuevaMatricula />
        </div>
      </div>
    </>
  )
}
