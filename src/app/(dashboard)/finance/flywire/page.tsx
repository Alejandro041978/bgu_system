import { Topbar } from '@/components/layout/topbar'
import { FlywireImport } from '@/components/finance/flywire-import'

export const revalidate = 0

export default function FlywireImportPage() {
  return (
    <>
      <Topbar title="Cargar Pagos Flywire" subtitle="Finanzas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <FlywireImport />
        </div>
      </div>
    </>
  )
}
