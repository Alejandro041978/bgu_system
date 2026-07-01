import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { EffectivenessPlanManager } from '@/components/planning/effectiveness-plan-manager'

export const revalidate = 0

export default async function EffectivenessPlanPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

  const [kpisRes, empsRes] = await Promise.all([
    sb.from('effectiveness_kpis').select('id, code, level, name, value_type, frequency').order('code'),
    sb.from('hr_employees').select('id, full_name').order('full_name'),
  ])

  return (
    <>
      <Topbar title="Cargar Plan · Efectividad" subtitle="Vincula KPIs al plan anual y registra resultados" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <EffectivenessPlanManager
            kpiCatalog={kpisRes.data ?? []}
            employees={empsRes.data ?? []}
          />
        </div>
      </div>
    </>
  )
}
