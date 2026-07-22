import { Topbar } from '@/components/layout/topbar'
import { OtherIncome } from '@/components/finance/other-income'

export const revalidate = 0

export default function OtrosIngresosPage() {
  return (
    <>
      <Topbar title="Otros Ingresos" subtitle="Finanzas — ingresos no académicos (libros, eventos, viajes)" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <OtherIncome />
        </div>
      </div>
    </>
  )
}
