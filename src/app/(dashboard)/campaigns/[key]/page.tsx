import { Topbar } from '@/components/layout/topbar'
import { CampaignDetail } from '@/components/campaigns/campaign-detail'
import { notFound } from 'next/navigation'

export const revalidate = 0

// Una página por campaña de Camila, cada una con su propio permiso
// (campaign_<key>): así el seguimiento de cada campaña se asigna a una persona
// distinta sin abrirle el resto.
const TITULOS: Record<string, { title: string; subtitle: string }> = {
  titulacion: { title: 'Campaña · Titulación', subtitle: 'Egresados sin título: asistencia para tramitarlo' },
  cobranza: { title: 'Campaña · Cobranza', subtitle: 'Activos con cuota vencida: orientación para ponerse al día' },
  cashpay: { title: 'Campaña · Cash Pay', subtitle: 'Activos al día: descuento por pronto pago' },
  ausente: { title: 'Campaña · Ausentes', subtitle: 'Activos que dejaron de entrar al aula' },
  iw: { title: 'Campaña · IW', subtitle: 'Retirados definitivos: regresa y termina tu programa' },
  loa: { title: 'Campaña · LOA', subtitle: 'Licencias por vencer: no pierdas lo logrado' },
}

export default async function CampaignPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const t = TITULOS[key]
  if (!t) notFound()
  return (
    <>
      <Topbar title={t.title} subtitle={t.subtitle} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <CampaignDetail campaignKey={key} />
        </div>
      </div>
    </>
  )
}
