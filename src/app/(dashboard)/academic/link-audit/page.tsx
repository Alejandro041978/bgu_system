import { Topbar } from '@/components/layout/topbar'
import { LinkAudit } from '@/components/academic/link-audit'

export const revalidate = 0

export default function LinkAuditPage() {
  return (
    <>
      <Topbar title="Auditor de vínculos de aula" subtitle="Contradicciones entre lo que el ERP cree que enseña un aula y lo que dicen las demás evidencias" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <LinkAudit />
        </div>
      </div>
    </>
  )
}
