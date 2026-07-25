import { Topbar } from '@/components/layout/topbar'
import { AdmissionCommissions } from '@/components/sales/admission-commissions'

export const revalidate = 0

export default function AdmissionCommissionsPage() {
  return (
    <>
      <Topbar title="Comisiones" subtitle="Tipos de admisión y comisiones por categoría" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <AdmissionCommissions />
        </div>
      </div>
    </>
  )
}
