import { Topbar } from '@/components/layout/topbar'
import { AdmissionSales } from '@/components/sales/admission-sales'

export const revalidate = 0

export default function AdmissionSalesPage() {
  return (
    <>
      <Topbar title="Ventas de Admisión" subtitle="Asesoras, tipos de admisión y comisiones por convocatoria" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <AdmissionSales />
        </div>
      </div>
    </>
  )
}
