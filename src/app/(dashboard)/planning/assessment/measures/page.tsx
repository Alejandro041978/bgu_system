import { Topbar } from '@/components/layout/topbar'
import { AssessmentMeasures } from '@/components/planning/assessment-measures'

export const revalidate = 0

export default function AssessmentMeasuresPage() {
  return (
    <>
      <Topbar title="Tablero de Medidas" subtitle="Plan de Evaluación de Resultados" />
      <div className="flex-1 p-6 overflow-auto"><div className="w-full"><AssessmentMeasures /></div></div>
    </>
  )
}
