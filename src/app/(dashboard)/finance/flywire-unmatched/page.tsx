import { Topbar } from '@/components/layout/topbar'
import { FlywireUnmatched } from '@/components/finance/flywire-unmatched'

export const revalidate = 0

export default function FlywireUnmatchedPage() {
  return (
    <>
      <Topbar title="Flywire · Sin conciliar" subtitle="Pagos notificados que no llegaron a ningún estado de cuenta" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <FlywireUnmatched />
        </div>
      </div>
    </>
  )
}
