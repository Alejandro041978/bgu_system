import { Topbar } from '@/components/layout/topbar'
import { CurricularRecord } from '@/components/academic/curricular-record'

export const revalidate = 0

export default function CurricularPage() {
  return (
    <>
      <Topbar title="Registro Curricular" subtitle="En qué está inscrito: las asignaturas matriculadas, sus retiros y los créditos que se cobran" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <CurricularRecord />
        </div>
      </div>
    </>
  )
}
