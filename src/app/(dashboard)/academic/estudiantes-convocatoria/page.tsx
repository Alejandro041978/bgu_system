import { Topbar } from '@/components/layout/topbar'
import { ConvocatoriaStudents } from '@/components/academic/convocatoria-students'

export const revalidate = 0

export default function EstudiantesConvocatoriaPage() {
  return (
    <>
      <Topbar title="Estudiantes por Convocatoria" subtitle="Comercial" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ConvocatoriaStudents />
        </div>
      </div>
    </>
  )
}
