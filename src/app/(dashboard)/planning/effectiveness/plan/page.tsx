import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { EffectivenessPlanManager } from '@/components/planning/effectiveness-plan-manager'

export const revalidate = 0

export default async function EffectivenessPlanPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

  const [kpisRes, empsRes, codRes] = await Promise.all([
    sb.from('effectiveness_kpis').select('id, code, level, name, value_type, frequency').order('code'),
    sb.from('hr_employees').select('id, full_name').order('full_name'),
    sb.from('effectiveness_plan_kpis').select('kpi_id, plan_code, created_at').not('plan_code', 'is', null).order('created_at'),
  ])

  // Solo se ofrecen para vincular los KPIs que el Catálogo de KPIs declara del
  // plan de efectividad, es decir, los que tienen SU código de efectividad
  // (E1-S01). Los exclusivos de evaluación (D-01…) o del estratégico (E2-K4) no
  // aparecen. Se muestran con ese código, no con el identificador interno.
  const codigoDe = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (codRes.data ?? []) as any[]) codigoDe.set(String(r.kpi_id), String(r.plan_code))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiCatalog = ((kpisRes.data ?? []) as any[])
    .filter(k => codigoDe.has(String(k.id)))
    .map(k => ({ ...k, code: codigoDe.get(String(k.id)) }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))

  return (
    <>
      <Topbar title="Cargar Plan · Efectividad" subtitle="Vincula KPIs al plan anual y registra resultados" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <EffectivenessPlanManager
            kpiCatalog={kpiCatalog}
            employees={empsRes.data ?? []}
          />
        </div>
      </div>
    </>
  )
}
