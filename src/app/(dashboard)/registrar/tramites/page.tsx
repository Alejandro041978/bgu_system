import { Topbar } from '@/components/layout/topbar'
import { TramitesManager } from '@/components/registrar/tramites-manager'

export const revalidate = 0

export default function TramitesPage() {
  return (
    <>
      <Topbar title="Trámites" subtitle="Solicitudes de los estudiantes: iniciados, pagados, atendidos y anulados" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <TramitesManager />
        </div>
      </div>
    </>
  )
}
