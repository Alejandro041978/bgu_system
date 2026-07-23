import { Topbar } from '@/components/layout/topbar'
import { Scholarships } from '@/components/collection/scholarships'

export const revalidate = 0

export default function ScholarshipsPage() {
  return (
    <>
      <Topbar title="Becas" subtitle="Otorgamiento de becas sobre el precio de lista (regulado)" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <Scholarships />
        </div>
      </div>
    </>
  )
}
