import { Topbar } from '@/components/layout/topbar'
import { CurricularCoverage } from '@/components/academic/curricular-coverage'

export const revalidate = 0

export default function CurricularCoveragePage() {
  return (
    <>
      <Topbar title="Cobertura del registro" subtitle="Matriculados a los que les faltan asignaturas de su malla" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <p className="text-xs text-gray-500">
            Un matriculado tiene en su registro las asignaturas de su programa, <strong>sea cual sea su estado</strong>.
            Al completarlo, las que le faltan se agregan como <strong>No iniciada</strong>: sin nota, sin periodo y sin
            efecto en su Total Tuition, que se sigue calculando sobre lo que lleva.
          </p>
          <CurricularCoverage />
        </div>
      </div>
    </>
  )
}
