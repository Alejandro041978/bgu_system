import { Topbar } from '@/components/layout/topbar'
import { GradeScalesManager } from '@/components/academic/grade-scales-manager'

export const revalidate = 0

export default function GradeScalesPage() {
  return (
    <>
      <Topbar title="Escalas de conversión" subtitle="Convalidaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-gray-500 mb-4">
            Gestiona las tablas de conversión de notas por país/institución y la nota de aprobación de destino por categoría.
            Cada convalidación (individual o masiva) usará la escala que elijas.
          </p>
          <GradeScalesManager />
        </div>
      </div>
    </>
  )
}
