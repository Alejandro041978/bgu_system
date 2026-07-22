import { Topbar } from '@/components/layout/topbar'
import { ExamsControl } from '@/components/academic/exams-control'

export const revalidate = 0

export default function ExamenesPage() {
  return (
    <>
      <Topbar title="Exámenes · Hoja de Control" subtitle="Solicitudes de examen: pago, notificación y registro de notas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ExamsControl />
        </div>
      </div>
    </>
  )
}
