import { Topbar } from '@/components/layout/topbar'
import { Bonuses } from '@/components/collection/bonuses'

export const revalidate = 0

export default function BonusesPage() {
  return (
    <>
      <Topbar title="Bonos" subtitle="Beneficio adicional sobre lo que resta después de la beca" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <Bonuses />
        </div>
      </div>
    </>
  )
}
