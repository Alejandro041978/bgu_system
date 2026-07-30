import { Topbar } from '@/components/layout/topbar'
import { IsicCards } from '@/components/registrar/isic-cards'

export const revalidate = 0

export default function IsicCardsPage() {
  return (
    <>
      <Topbar title="Carnés ISIC · Licencias" subtitle="Bloque de números adquirido a ISIC y a qué estudiante se asignó cada uno" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <IsicCards />
        </div>
      </div>
    </>
  )
}
