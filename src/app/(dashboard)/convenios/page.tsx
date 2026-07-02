import { Topbar } from '@/components/layout/topbar'
import { ConveniosManager } from '@/components/convenios/convenios-manager'

export const revalidate = 0

export default function ConveniosPage() {
  return (
    <>
      <Topbar title="Convenios" subtitle="Convenios institucionales suscritos" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <ConveniosManager />
        </div>
      </div>
    </>
  )
}
