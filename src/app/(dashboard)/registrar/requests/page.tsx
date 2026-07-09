import { Topbar } from '@/components/layout/topbar'
import { RequestsManager } from '@/components/registrar/requests-manager'

export const revalidate = 0

export default function DocumentRequestsPage() {
  return (
    <>
      <Topbar title="Solicitudes de Documentos" subtitle="Registrar" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <RequestsManager />
        </div>
      </div>
    </>
  )
}
