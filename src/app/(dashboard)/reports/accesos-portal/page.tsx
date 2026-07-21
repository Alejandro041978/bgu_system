import { Topbar } from '@/components/layout/topbar'
import { PortalLoginsReport } from '@/components/reports/portal-logins-report'

export const revalidate = 0

export default function AccesosPortalPage() {
  return (
    <>
      <Topbar title="Accesos al Portal" subtitle="Reportes" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <PortalLoginsReport />
        </div>
      </div>
    </>
  )
}
