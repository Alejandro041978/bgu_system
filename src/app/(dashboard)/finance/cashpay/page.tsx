import { Topbar } from '@/components/layout/topbar'
import { CashpayRequests } from '@/components/finance/cashpay-requests'

export const revalidate = 0

export default function CashpayPage() {
  return (
    <>
      <Topbar title="Cashpay" subtitle="Solicitudes de descuento por adelanto de cuotas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <CashpayRequests />
        </div>
      </div>
    </>
  )
}
