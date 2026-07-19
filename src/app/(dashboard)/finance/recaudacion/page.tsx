import { Topbar } from '@/components/layout/topbar'
import { RecaudacionReport } from '@/components/reports/recaudacion-report'

export const revalidate = 0

export default function RecaudacionPage() {
  return (
    <>
      <Topbar title="Recaudación" subtitle="Finanzas" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <RecaudacionReport />
        </div>
      </div>
    </>
  )
}
