import { Topbar } from '@/components/layout/topbar'
import { UpgradeSimulatorAdmin } from '@/components/admissions/upgrade-simulator-admin'

export const revalidate = 0

export default function UpgradeSimulatorPage() {
  return (
    <>
      <Topbar title="Simulador Upgrade" subtitle="Admisión · convalidación para egresados de institutos licenciados" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <UpgradeSimulatorAdmin />
        </div>
      </div>
    </>
  )
}
