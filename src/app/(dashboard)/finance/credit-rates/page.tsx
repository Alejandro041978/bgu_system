import { Topbar } from '@/components/layout/topbar'
import { CreditRates } from '@/components/finance/credit-rates'

export const revalidate = 0

export default function CreditRatesPage() {
  return (
    <>
      <Topbar title="Tarifas por Crédito" subtitle="Precios oficiales publicados — versiones con vigencia (regulado)" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <CreditRates />
        </div>
      </div>
    </>
  )
}
