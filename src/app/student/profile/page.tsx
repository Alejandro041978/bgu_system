import { StudentProfileView } from '@/components/student/student-profile-view'

export const revalidate = 0

export default function StudentProfilePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Mis Datos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Lo que la universidad tiene registrado a tu nombre
        </p>
      </div>
      <StudentProfileView />
    </div>
  )
}
