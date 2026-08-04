import { Topbar } from '@/components/layout/topbar'
import { AssessmentDashboard } from '@/components/planning/assessment-dashboard'

export const revalidate = 0

export default function AssessmentDashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" subtitle="Plan de Evaluación de Resultados" />
      <div className="flex-1 p-6 overflow-auto"><div className="w-full"><AssessmentDashboard /></div></div>
    </>
  )
}
