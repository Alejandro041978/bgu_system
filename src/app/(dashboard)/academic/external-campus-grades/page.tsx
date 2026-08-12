import { Topbar } from '@/components/layout/topbar'
import { ScopedGrades } from '@/components/academic/scoped-grades'

export const revalidate = 0

export default function ExternalCampusGradesPage() {
  return (
    <>
      <Topbar title="Notas de campus externo" subtitle="Calificaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <ScopedGrades
            endpoint="/api/academic/external-campus-grades"
            explica="Estos programas se dictan en otra institución y la calificación nace en su plataforma, no en nuestras aulas. Por eso alguien tiene que traerla a mano: aquí, y solo para estas asignaturas."
          />
        </div>
      </div>
    </>
  )
}
