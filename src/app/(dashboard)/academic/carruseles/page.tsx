import { Topbar } from '@/components/layout/topbar'
import { CarouselsOverview } from '@/components/academic/carousels-overview'

export const revalidate = 0

export default function CarruselesPage() {
  return (
    <>
      <Topbar title="Carruseles" subtitle="Cobertura: todo activo debe estar en un carrusel (= acceso a Moodle)" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <CarouselsOverview />
        </div>
      </div>
    </>
  )
}
