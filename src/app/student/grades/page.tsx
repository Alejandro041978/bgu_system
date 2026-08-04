import { MyGrades } from '@/components/student/my-grades'

export const revalidate = 0

// La misma acta que ve Registros, resuelta desde la sesión del estudiante.
// Antes esta página listaba solo las filas de academic_grades, así que sus
// convalidadas y sus asignaturas pendientes no aparecían: veía un pedazo de su
// expediente creyendo que era todo.
export default function StudentGradesPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Mis Notas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tus asignaturas y sus calificaciones</p>
      </div>
      <MyGrades />
    </div>
  )
}
