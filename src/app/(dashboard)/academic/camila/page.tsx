import { Topbar } from '@/components/layout/topbar'
import { CamilaDashboard } from '@/components/academic/camila-dashboard'
import { CampaignsMonitor } from '@/components/academic/campaigns-monitor'

export const revalidate = 0

export default function CamilaPage() {
  return (
    <>
      <Topbar title="Camila · Tablero" subtitle="Monitor de campañas: retención, cobranza, titulación y más" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Todas las campañas del modelo nuevo */}
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Campañas</h2>
            <CampaignsMonitor />
          </section>

          {/* Retención: campaña viva, con su motor y su embudo propios */}
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Retención · detalle</h2>
            <CamilaDashboard />
          </section>
        </div>
      </div>
    </>
  )
}
