import { Topbar } from '@/components/layout/topbar'
import { GradesCsvImport } from '@/components/academic/grades-csv-import'

export const revalidate = 0

export default function GradesImportPage() {
  return (
    <>
      <Topbar title="Cargar Notas (CSV)" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <GradesCsvImport />
        </div>
      </div>
    </>
  )
}
