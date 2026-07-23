import { Topbar } from '@/components/layout/topbar'
import { AdmissionDocuments } from '@/components/sales/admission-documents'

export const revalidate = 0

export default function AdmissionDocumentsPage() {
  return (
    <>
      <Topbar title="Documentos de Postulación" subtitle="Expediente de admisión por estudiante y convocatoria" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <AdmissionDocuments />
        </div>
      </div>
    </>
  )
}
