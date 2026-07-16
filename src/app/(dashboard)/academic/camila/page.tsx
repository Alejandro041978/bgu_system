import { Topbar } from '@/components/layout/topbar'
import { CamilaDashboard } from '@/components/academic/camila-dashboard'

export const revalidate = 0

export default function CamilaPage() {
  return (
    <>
      <Topbar title="Camila · Tablero" subtitle="Campaña de retención: del padrón a la reconexión" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <CamilaDashboard />
        </div>
      </div>
    </>
  )
}
