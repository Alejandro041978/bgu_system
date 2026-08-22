import { Topbar } from '@/components/layout/topbar'
import { CarouselAudit } from '@/components/reports/carousel-audit'

export const revalidate = 0

export default function CarouselAuditPage() {
  return (
    <>
      <Topbar title="Auditor de carruseles" subtitle="Dónde debería estar cada estudiante activo según sus notas, por programa y carrusel" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <CarouselAudit />
        </div>
      </div>
    </>
  )
}
