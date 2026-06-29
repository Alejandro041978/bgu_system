'use client'

import { useState, useEffect } from 'react'
import { X, CheckCircle2, XCircle } from 'lucide-react'

type KpiDef = {
  id: string
  name: string
  metric_type: string
  target_value: number
  unit: string | null
  comparison: string
  result: { current_value: number | null; met: boolean | null; calculated_at: string } | null
}

type Employee = {
  employee_id: string
  full_name: string
  position: string | null
  last_calculated: string | null
}

const UNIT_LABEL: Record<string, string> = {
  tickets: 'tickets mínimo',
  hrs: 'hrs máximo',
  '%': '% mínimo',
  sesiones: 'sesiones mínimo',
  asistentes: 'asistentes mínimo',
  puntaje: 'puntaje mínimo',
}

function formatValue(value: number | null, unit: string | null) {
  if (value === null || value === undefined) return '—'
  const formatted = Number.isInteger(value) ? value : value.toFixed(1)
  return `${formatted}${unit ? ' ' + unit : ''}`
}

export function KpiEmployeeModal({
  employee,
  periodId,
  onClose,
}: {
  employee: Employee
  periodId: string
  onClose: () => void
}) {
  const [kpis, setKpis] = useState<KpiDef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/kpis/${periodId}/employee/${employee.employee_id}`)
      const data = await res.json() as KpiDef[]
      setKpis(Array.isArray(data) ? data : [])
      setLoading(false)
    }
    load()
  }, [periodId, employee.employee_id])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">{employee.full_name}</h2>
            {employee.position && <p className="text-sm text-gray-400">{employee.position}</p>}
            {employee.last_calculated && (
              <p className="text-xs text-gray-500 mt-1">
                Resumen calculado el {new Date(employee.last_calculated).toLocaleString('es-PE')} · Detalle en tiempo real
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <p className="text-center text-gray-500 py-8">Cargando KPIs...</p>
          ) : kpis.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No hay KPIs configurados para este colaborador.</p>
          ) : (
            kpis.map(kpi => {
              const value = kpi.result?.current_value ?? null
              const met = kpi.result?.met ?? null
              const pct = value !== null
                ? kpi.comparison === 'lte'
                  ? Math.min(100, Math.round((kpi.target_value / (value || 1)) * 100))
                  : Math.min(100, Math.round((value / kpi.target_value) * 100))
                : 0

              return (
                <div key={kpi.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-100">{kpi.name}</p>
                    {met === null ? (
                      <span className="text-xs text-gray-500">Sin datos</span>
                    ) : met ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Cumplido
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="w-3.5 h-3.5" /> No cumplido
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className={`text-xl font-bold ${met === null ? 'text-gray-500' : met ? 'text-green-400' : 'text-red-400'}`}>
                      {formatValue(value, kpi.unit)}
                    </span>
                    <span className="text-xs text-gray-400">
                      de {kpi.target_value} {kpi.unit ? UNIT_LABEL[kpi.unit] ?? kpi.unit : ''}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${met ? 'bg-green-500' : pct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
