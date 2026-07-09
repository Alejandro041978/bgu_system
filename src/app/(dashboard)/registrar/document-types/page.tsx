import { Topbar } from '@/components/layout/topbar'
import { DocumentTypesManager } from '@/components/registrar/document-types-manager'

export const revalidate = 0

export default function DocumentTypesPage() {
  return (
    <>
      <Topbar title="Tipos de Documento" subtitle="Registrar" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <DocumentTypesManager />
        </div>
      </div>
    </>
  )
}
