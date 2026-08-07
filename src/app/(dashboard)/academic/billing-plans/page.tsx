import { Topbar } from '@/components/layout/topbar'
import { BillingTemplatesManager } from '@/components/account/billing-templates-manager'

export const revalidate = 0

export default function BillingPlansPage() {
  return (
    <>
      <Topbar title="Plantillas de Facturación" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <BillingTemplatesManager />
        </div>
      </div>
    </>
  )
}
