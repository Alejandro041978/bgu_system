import { Topbar } from '@/components/layout/topbar'
import { AccountConceptsManager } from '@/components/account/account-concepts-manager'

export const revalidate = 0

export default function AccountConceptsPage() {
  return (
    <>
      <Topbar title="Conceptos de Cuenta" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <AccountConceptsManager />
        </div>
      </div>
    </>
  )
}
