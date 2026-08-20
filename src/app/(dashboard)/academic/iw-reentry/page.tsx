import { Topbar } from '@/components/layout/topbar'
import { IwReentryManager } from '@/components/academic/iw-reentry-manager'

export const revalidate = 0

export default function IwReentryPage() {
  return (
    <>
      <Topbar title="Gestor IW · Re-Entry" subtitle="Ajuste autorizado del registro curricular y el plan de pagos" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <IwReentryManager />
        </div>
      </div>
    </>
  )
}
