import { CampusCheck } from '@/components/student/campus-check'

export const revalidate = 0

// Verificar Campus: lo que el estudiante debería tener en Moodle (su ruta y
// sus aulas) contra lo que Moodle dice que tiene, con un botón para reportar
// la inconsistencia como ticket si no coincide.
export default function StudentCampusCheckPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Verificar Campus</h1>
        <p className="text-sm text-gray-500 mt-0.5">Comprueba tu acceso al campus virtual y a tus asignaturas</p>
      </div>
      <CampusCheck />
    </div>
  )
}
