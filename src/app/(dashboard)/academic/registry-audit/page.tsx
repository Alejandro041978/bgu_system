import { Topbar } from '@/components/layout/topbar'
import { RegistryAudit } from '@/components/academic/registry-audit'

export const revalidate = 0

export default function AuditorDelRegistroPage() {
  return (
    <>
      <Topbar title="Auditor del Registro" subtitle="Académico" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <RegistryAudit />
        </div>
      </div>
    </>
  )
}
