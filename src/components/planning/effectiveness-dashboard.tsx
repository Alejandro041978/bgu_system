'use client'

import { useState, useEffect } from 'react'
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface EffectivenessPlan { id: string; name: string; year: number }

interface PlanKPI {
  id: string; kpi_id: string
  link_type: string | null
  meta: number | null; responsible_id: string | null
  resultado: number | null; resultado_updated_at: string | null
  kpi: {
    code: string; level: string; name: string; formula?: string
    value_type: string; frequency: string
  } | null
  responsible: { id: string; full_name: string } | null
}

const LEVEL_COLORS: Record<string, string> = {
  institucional: 'bg-purple-100 text-purple-700',
  estrategico: 'bg-blue-100 text-blue-700',
  operativo: 'bg-green-100 text-green-700',
}

const LINK_LABELS: Record<string, string> = {
  objetivo: 'Objetivo',
  accion_estrategica: 'Acción estratégica',
  accion_responsable: 'Acción por responsable',
}

function formatValue(value: number, valueType: string): string {
  if (valueType === 'porcentaje') return `${value}%`
  if (valueType === 'entero') return Math.round(value).toString()
  return value % 1 === 0 ? value.toString() : value.toFixed(2)
}

function getPctColor(pct: number): string {
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getPctTextColor(pct: number): string {
  if (pct >= 90) return 'text-green-700'
  if (pct >= 70) return 'text-yellow-700'
  return 'text-red-700'
}

export function EffectivenessDashboard({ plans }: { plans: EffectivenessPlan[] }) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? '')
  const [kpis, setKpis] = useState<PlanKPI[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedPlanId) return
    setLoading(true)
    fetch(`/api/planning/effectiveness/plan-kpis?plan_id=${selectedPlanId}`)
      .then(r => r.json())
      .then((d: PlanKPI[]) => { setKpis(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedPlanId])

  const selectedPlan = plans.find(p => p.id === selectedPlanId)

  // Summary stats
  const withResult = kpis.filter(k => k.resultado != null && k.meta != null && k.meta > 0)
  const avgPct = withResult.length > 0
    ? withResult.reduce((sum, k) => sum + Math.min(((k.resultado! / k.meta!) * 100), 100), 0) / withResult.length
    : null

  const greenCount = withResult.filter(k => (k.resultado! / k.meta!) * 100 >= 90).length
  const yellowCount = withResult.filter(k => { const p = (k.resultado! / k.meta!) * 100; return p >= 70 && p < 90 }).length
  const redCount = withResult.filter(k => (k.resultado! / k.meta!) * 100 < 70).length

  return (
    <div className="space-y-6">
      {/* Header + plan selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Dashboard de Efectividad</h2>
          <p className="text-sm text-gray-500">Resultados vs metas por KPI</p>
        </div>
        {plans.length > 0 && (
          <select value={selectedPlanId}
            onChange={e => setSelectedPlanId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.year})</option>)}
          </select>
        )}
      </div>

      {/* Summary cards */}
      {selectedPlan && !loading && withResult.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Promedio general</p>
            <p className={`text-2xl font-bold ${getPctTextColor(avgPct ?? 0)}`}>{avgPct != null ? `${avgPct.toFixed(1)}%` : '—'}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              <p className="text-xs text-green-700 font-medium">En meta (≥90%)</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{greenCount}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Minus className="w-3.5 h-3.5 text-yellow-600" />
              <p className="text-xs text-yellow-700 font-medium">En progreso (70–89%)</p>
            </div>
            <p className="text-2xl font-bold text-yellow-700">{yellowCount}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-600" />
              <p className="text-xs text-red-700 font-medium">Bajo meta (&lt;70%)</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{redCount}</p>
          </div>
        </div>
      )}

      {/* KPI table */}
      {plans.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No hay planes creados aún.</div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : kpis.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No hay KPIs en este plan.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-20">Código</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Nivel</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Denominación KPI</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-20">Meta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-20">Resultado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-40">% Éxito</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Responsable</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Vinculación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Actualización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kpis.map(pk => {
                const hasBoth = pk.meta != null && pk.meta > 0 && pk.resultado != null
                const pct = hasBoth ? Math.min((pk.resultado! / pk.meta!) * 100, 200) : null
                const vt = pk.kpi?.value_type ?? 'decimal'
                return (
                  <tr key={pk.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{pk.kpi?.code ?? '—'}</td>
                    <td className="px-4 py-3">
                      {pk.kpi && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[pk.kpi.level] ?? 'bg-gray-100 text-gray-600'}`}>
                          {pk.kpi.level === 'institucional' ? 'Inst.' : pk.kpi.level === 'estrategico' ? 'Estrat.' : 'Oper.'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900 text-xs font-medium">{pk.kpi?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {vt === 'porcentaje' ? '%' : vt === 'entero' ? 'Entero' : 'Decimal'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {pk.meta != null ? formatValue(pk.meta, vt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {pk.resultado != null ? formatValue(pk.resultado, vt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {pct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${getPctColor(pct)}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold w-12 text-right ${getPctTextColor(pct)}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Sin datos</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{pk.responsible?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {pk.link_type ? LINK_LABELS[pk.link_type] ?? pk.link_type : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{pk.resultado_updated_at ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
