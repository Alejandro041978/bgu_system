import { StudentDocuments } from '@/components/student/student-documents'

export const revalidate = 0

export default function StudentDocumentsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Documentos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Solicita constancias y certificados, y descárgalos cuando estén listos</p>
      </div>
      <StudentDocuments />
    </div>
  )
}
