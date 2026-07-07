import { Topbar } from '@/components/layout/topbar'
import { ActaPersonal } from '@/components/academic/acta-personal'

export const revalidate = 0

export default function ActaPersonalPage() {
  return (
    <>
      <Topbar title="Acta Personal" subtitle="Gestión académica" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <ActaPersonal />
        </div>
      </div>
    </>
  )
}
