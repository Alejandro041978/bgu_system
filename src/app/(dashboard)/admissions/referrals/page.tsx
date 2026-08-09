import { Topbar } from '@/components/layout/topbar'
import { ReferralsControl } from '@/components/admissions/referrals-control'

export const revalidate = 0

export default function ReferralsPage() {
  return (
    <>
      <Topbar title="Free Degree · Referidos" subtitle="Quién refirió a quién y cómo va el crédito de titulación" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <p className="text-xs text-gray-500">
            Cada referido que llega a pagar su Enrollment vale <strong>$100</strong> de descuento sobre el derecho de
            titulación del estudiante que lo trajo, que cuesta <strong>$400</strong>. Los referidos que ya estaba
            trabajando Admisión —con contacto en los últimos 3 meses o en etapa <em>interesado</em> o más— no generan
            crédito.
          </p>
          <ReferralsControl />
        </div>
      </div>
    </>
  )
}
