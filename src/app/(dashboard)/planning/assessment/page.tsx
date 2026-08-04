import { Topbar } from '@/components/layout/topbar'
import { AssessmentPlan } from '@/components/planning/assessment-plan'

export const revalidate = 0

export default function AssessmentPlanPage() {
  return (
    <>
      <Topbar title="Plan de Evaluación de Resultados" subtitle="Institutional Assessment Plan" />
      <div className="flex-1 p-6 overflow-auto"><div className="w-full"><AssessmentPlan /></div></div>
    </>
  )
}
