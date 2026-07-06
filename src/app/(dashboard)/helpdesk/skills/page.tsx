import { Topbar } from '@/components/layout/topbar'
import { SkillsManager } from '@/components/helpdesk/skills-manager'

export const revalidate = 0

export default function HelpdeskSkillsPage() {
  return (
    <>
      <Topbar title="Helpdesk · Skills de agentes" subtitle="Atención al Cliente" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="text-sm text-gray-600 mb-4 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1">
            <p>Asigna a cada agente sus <strong>idiomas</strong>, <strong>temas</strong> y <strong>categorías</strong> (chip vacío = atiende todos).</p>
            <p className="text-xs text-gray-500">
              <strong>Cómo se reparte:</strong> al llegar una conversación se evalúan <em>todas</em> las asesoras en línea a la vez.
              Si <em>alguna</em> califica, se asigna por round-robin entre las calificadas. Solo si <em>ninguna</em> del equipo puede atenderla,
              recién pasa a la supervisora para triage manual. La supervisora no recibe auto-asignaciones. Marca <strong>«Es la supervisora del equipo»</strong> en una sola persona.
            </p>
          </div>
          <SkillsManager />
        </div>
      </div>
    </>
  )
}
