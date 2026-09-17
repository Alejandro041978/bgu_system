'use client'

import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { useIAP, SelectorPlan, Tarjeta, ESTADO } from './assessment-shared'

// ---------------------------------------------------------------------------
// EL DASHBOARD — resultados contra estándar, por objetivo institucional.
//
// Usa la escala de cinco estados del documento, no un cumple/no-cumple. La
// distinción que más pesa es "sin datos": no es un incumplimiento, es un vacío
// de evidencia, y ante un acreditador son cosas opuestas. Por eso va en gris y
// nunca en rojo.
// ---------------------------------------------------------------------------
export function AssessmentDashboard() {
  const { d, planId, cargando, error, traer } = useIAP()

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando resultados…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null
  if (d.sin_planes) return <p className="text-sm text-gray-500">Todavía no hay ningún plan de evaluación: créalo en Plan de Evaluación de Resultados.</p>

  const c = d.cobertura
  const porCodigo = new Map(d.medidas.map(m => [m.code, m]))
  const evidencia = c.medidas ? Math.round((c.con_resultado * 100) / c.medidas) : 0

  return (
    <div className="space-y-5">
      <SelectorPlan d={d} planId={planId} cargando={cargando} traer={traer} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Medidas evaluadas" valor={`${evidencia}%`} detalle={`${c.con_resultado} de ${c.medidas} con estado asignado`} alerta={evidencia < 50} />
        <Tarjeta titulo="Cumplen la meta" valor={c.cumplidos} detalle={`${c.parciales} parciales`} />
        <Tarjeta titulo="No cumplidas" valor={c.no_cumplidos} detalle="candidatas a plan de mejora" alerta={c.no_cumplidos > 0} />
        <Tarjeta titulo="Sin datos" valor={c.sin_datos} detalle={`${c.no_aplicables} no aplicables`} alerta={c.sin_datos > 0} />
      </div>

      {/* Los KPIs del plan de evaluación no se relacionan con los objetivos
          estratégicos (17/09/2026): se listan directos y luego indirectos. */}
      {(['directa', 'indirecta'] as const).map(tipo => {
        const ms = d.medidas.filter(m => m.tipo === tipo).sort((x, y) => x.code.localeCompare(y.code))
        const conRes = ms.filter(m => m.estado !== null).length
        const bajo = ms.filter(m => m.estado === 'no_cumplido').length
        const pct = ms.length ? Math.round((conRes * 100) / ms.length) : 0
        return (
          <div key={tipo} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-start justify-between gap-3 flex-wrap border-b border-gray-200 bg-gray-50 px-4 py-2">
              <p className="text-xs font-semibold text-gray-500">{tipo === 'directa' ? 'KPIs directos (D)' : 'KPIs indirectos (I)'}</p>
              <p className="text-xs tabular-nums text-gray-500">
                {conRes}/{ms.length} con dato
                {!!bajo && <span className="ml-2 font-medium text-red-700">{bajo} bajo estándar</span>}
              </p>
            </div>
            <div className="px-4 py-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${pct >= 60 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-200'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {ms.map(m => (
                  <span key={m.code} title={`${m.name}${m.resultado_texto ? ` — ${m.resultado_texto}` : ' — sin dato'}`}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${m.estado ? ESTADO[m.estado].cls : ESTADO.sin_datos.cls}`}>
                    {m.estado === 'cumplido' ? <CheckCircle2 className="h-3 w-3" />
                      : m.estado === 'no_cumplido' ? <XCircle className="h-3 w-3" />
                      : <MinusCircle className="h-3 w-3" />}
                    {m.code}
                  </span>
                ))}
                {!ms.length && <span className="text-xs text-gray-400">Sin KPIs de este tipo en el plan.</span>}
              </div>
            </div>
          </div>
        )
      })}

      <p className="text-xs text-gray-500">
        Un KPI en gris no significa que se esté cumpliendo ni que se esté incumpliendo: significa que
        <b> todavía no hay con qué afirmarlo</b>. Esa distinción es la que sostiene o hunde un informe de
        acreditación, y por eso el tablero la muestra en vez de rellenarla con ceros.
      </p>
    </div>
  )
}
