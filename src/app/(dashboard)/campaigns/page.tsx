import { Topbar } from '@/components/layout/topbar'
import { CampaignsBoard } from '@/components/campaigns/campaigns-board'

export const revalidate = 0

export default function CampaignsPage() {
  return (
    <>
      <Topbar title="Campañas" subtitle="Motor outbound de Micaela — un número, una persona, campañas mutuamente excluyentes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <CampaignsBoard />
        </div>
      </div>
    </>
  )
}
