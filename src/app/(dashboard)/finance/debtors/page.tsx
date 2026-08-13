import { Topbar } from '@/components/layout/topbar'
import { DebtorsList } from '@/components/finance/debtors-list'

export const revalidate = 0

export default function DebtorsPage() {
  return (
    <>
      <Topbar title="Relación de Deudores" subtitle="Finanzas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <DebtorsList />
        </div>
      </div>
    </>
  )
}
