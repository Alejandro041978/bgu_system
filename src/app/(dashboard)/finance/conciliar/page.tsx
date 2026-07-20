import { Topbar } from '@/components/layout/topbar'
import { PagosConciliar } from '@/components/finance/pagos-conciliar'

export const revalidate = 0

export default function PagosConciliarPage() {
  return (
    <>
      <Topbar title="Pagos por Conciliar" subtitle="Finanzas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <PagosConciliar />
        </div>
      </div>
    </>
  )
}
