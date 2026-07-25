import { Topbar } from '@/components/layout/topbar'
import { CurricularRecord } from '@/components/academic/curricular-record'

export const revalidate = 0

export default function CurricularPage() {
  return (
    <>
      <Topbar title="Registro Curricular" subtitle="Retiro de asignaturas sin calificaciones — baja el consumo de créditos y el Total Tuition" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <CurricularRecord />
        </div>
      </div>
    </>
  )
}
