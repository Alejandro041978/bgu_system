import { StudentTramites } from '@/components/student/student-tramites'

export const revalidate = 0

export default function StudentTramitesPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Trámites</h1>
        <p className="text-sm text-gray-500 mt-0.5">Solicita un trámite: el costo se carga a tu estado de cuenta y se atiende una vez pagado</p>
      </div>
      <StudentTramites />
    </div>
  )
}
