import { Topbar } from '@/components/layout/topbar'
import { ScopedGrades } from '@/components/academic/scoped-grades'

export const revalidate = 0

// Esta página solo califica. Qué asignaturas son capstone se declara en
// Programas, junto a la malla: es una propiedad del plan de estudios y la
// regula la Dirección Académica, no quien registra las notas.
export default function CapstoneGradesPage() {
  return (
    <>
      <Topbar title="Notas de Capstone" subtitle="Calificaciones" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <ScopedGrades
            endpoint="/api/academic/capstone-grades"
            explica="El capstone se defiende, no se rinde en el aula. El aula acompaña y da acceso; la nota sale de la defensa y se registra aquí. Las asignaturas con esta condición se declaran en Programas."
          />
        </div>
      </div>
    </>
  )
}
