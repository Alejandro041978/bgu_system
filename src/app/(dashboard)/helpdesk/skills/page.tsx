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
            <p>Asigna a cada agente sus <strong>idiomas</strong> y <strong>temas</strong>. <strong>Importante:</strong> un skill sin marcar = el agente <em>no</em> recibe eso; solo atiende lo que configuras aquí.</p>
            <p className="text-xs text-gray-500">
              <strong>Cómo se reparte:</strong> al llegar una conversación se evalúan <em>todas</em> las asesoras en línea a la vez.
              Califica quien tenga <em>marcado ese idioma Y ese tema</em>. Si alguna califica, se asigna por round-robin entre las calificadas.
              Si <em>ninguna</em> tiene ese idioma+tema, se auto-asigna a la <strong>supervisora</strong> (catch-all), que la revisa y la reparte con el botón <strong>«Derivar a…»</strong> del buzón.
              Marca <strong>«Es la supervisora del equipo»</strong> en una sola persona y déjala <strong>En línea</strong>.
            </p>
          </div>
          <SkillsManager />
        </div>
      </div>
    </>
  )
}
