import { Topbar } from '@/components/layout/topbar'
import { IWActivity } from '@/components/academic/iw-activity'

export const revalidate = 0

export default function IWActivityPage() {
  return (
    <>
      <Topbar title="Efectividad de los IW" subtitle="Retiros" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full">
          <IWActivity />
        </div>
      </div>
    </>
  )
}
