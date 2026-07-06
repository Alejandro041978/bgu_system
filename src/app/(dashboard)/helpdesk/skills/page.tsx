import { Topbar } from '@/components/layout/topbar'
import { SkillsManager } from '@/components/helpdesk/skills-manager'

export const revalidate = 0

export default function HelpdeskSkillsPage() {
  return (
    <>
      <Topbar title="Helpdesk · Skills de agentes" subtitle="Atención al Cliente" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-gray-500 mb-4">
            Asigna a cada agente del equipo helpdesk sus <strong>idiomas</strong>, <strong>temas</strong> y <strong>categorías</strong>.
            Las conversaciones se auto-asignan (round-robin) a la agente calificada en línea; lo no clasificable va a la supervisora.
          </p>
          <SkillsManager />
        </div>
      </div>
    </>
  )
}
