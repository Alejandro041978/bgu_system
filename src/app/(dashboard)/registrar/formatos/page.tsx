import { Topbar } from '@/components/layout/topbar'
import { FormatsView } from '@/components/registrar/formats-view'

export const revalidate = 0

export default function FormatsPage() {
  return (
    <>
      <Topbar title="Formatos" subtitle="Registrar" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <FormatsView />
        </div>
      </div>
    </>
  )
}
