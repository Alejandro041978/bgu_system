import { Topbar } from '@/components/layout/topbar'
import { AccountStatementSearch } from '@/components/account/account-statement-search'

export const revalidate = 0

export default function AccountStatementPage() {
  return (
    <>
      <Topbar title="Estado de Cuenta" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <AccountStatementSearch />
        </div>
      </div>
    </>
  )
}
