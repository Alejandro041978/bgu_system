'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Settings, CheckCircle2, XCircle, Users, Star } from 'lucide-react'
import Link from 'next/link'
import { KpiEmployeeModal } from './kpi-employee-modal'

type Period = {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'active' | 'closed' | 'draft'
}

type EmployeeSummary = {
  period_id: string
  employee_id: string
  full_name: string
  email: string
  position: string | null
  total_kpis: number
  met_kpis: number
  has_bonus: boolean
  last_calculated: string | null
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', closed: 'Cerrado', draft: 'Borrador',
}

export function KpiDashboard({ periods }: { periods: Period[] }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    periods.find(p => p.status === 'active')?.id ?? periods[0]?.id ?? ''
  )
  const [summary, setSummary] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null)

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId)

  const loadSummary = useCallback(async () => {
    if (!selectedPeriodId) return
    setLoading(true)
    const res = await fetch(`/api/kpis/${selectedPeriodId}/summary`)
    const data = await res.json() as EmployeeSummary[]
    setSummary(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [selectedPeriodId])

  useEffect(() => { loadSummary() }, [loadSummary])

  async function handleCalculate() {
    if (!selectedPeriodId) return
    setCalculating(true)
    await fetch(`/api/kpis/${selectedPeriodId}/calculate`, { method: 'POST' })
    await loadSummary()
    setCalculating(false)
  }

  const totalWorkers = summary.length
  const withBonus = summary.filter(e => e.has_bonus).length
  const withoutBonus = summary.filter(e => !e.has_bonus && e.total_kpis > 0).length
  const totalKpis = summary.reduce((s, e) => s + e.total_kpis, 0)
  const metKpis = summary.reduce((s, e) => s + e.met_kpis, 0)
  const pctKpis = totalKpis > 0 ? Math.round((metKpis / totalKpis) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          <h1 className="text-base font-bold">Dashboard Mes Calidad</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/kpis/periods"
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" /> Configurar
          </Link>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Selector de período */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Período:</span>
          <select
            value={selectedPeriodId}
            onChange={e => setSelectedPeriodId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} · {STATUS_LABEL[p.status]}
              </option>
            ))}
          </select>
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${calculating ? 'animate-spin' : ''}`} />
            {calculating ? 'Calculando...' : 'Actualizar'}
          </button>
        </div>

        {/* Info del período */}
        {selectedPeriod && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-3 flex items-center gap-8 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Periodo</p>
              <p className="font-semibold">{selectedPeriod.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Inicio</p>
              <p className="font-semibold">{new Date(selectedPeriod.start_date).toLocaleDateString('es-PE')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fin</p>
              <p className="font-semibold">{new Date(selectedPeriod.end_date).toLocaleDateString('es-PE')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Estado</p>
              <p className={`font-semibold ${selectedPeriod.status === 'active' ? 'text-green-400' : 'text-gray-400'}`}>
                {STATUS_LABEL[selectedPeriod.status]}
              </p>
            </div>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-3xl font-bold text-blue-400">{totalWorkers}</p>
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-gray-400 uppercase tracking-wide">
              <Users className="w-3 h-3" /> Trabajadores
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-3xl font-bold text-green-400">{withBonus}</p>
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-gray-400 uppercase tracking-wide">
              <CheckCircle2 className="w-3 h-3" /> Con Bono
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-3xl font-bold text-red-400">{withoutBonus}</p>
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-gray-400 uppercase tracking-wide">
              <XCircle className="w-3 h-3" /> Sin Bono
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-3xl font-bold text-purple-400">{pctKpis}%</p>
            <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">KPIs Cumplidos</p>
          </div>
        </div>

        {/* Tabla de trabajadores */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Trabajador</th>
                <th className="text-left px-5 py-3">KPIs Cumplidos</th>
                <th className="text-left px-5 py-3">Bono</th>
                <th className="text-left px-5 py-3">Actualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-500">Cargando...</td>
                </tr>
              ) : summary.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-500">
                    No hay colaboradores con KPIs en este período.{' '}
                    <Link href="/kpis/periods" className="text-blue-400 hover:underline">Configurar →</Link>
                  </td>
                </tr>
              ) : (
                summary.map(emp => {
                  const pct = emp.total_kpis > 0 ? Math.round((emp.met_kpis / emp.total_kpis) * 100) : 0
                  return (
                    <tr
                      key={emp.employee_id}
                      className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedEmployee(emp)}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-white">{emp.full_name}</p>
                        {emp.position && <p className="text-xs text-gray-500">{emp.position}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{emp.met_kpis}/{emp.total_kpis}</span>
                          <span className="text-xs text-gray-500">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {emp.total_kpis === 0 ? (
                          <span className="text-xs text-gray-500">Sin KPIs</span>
                        ) : emp.has_bonus ? (
                          <span className="flex items-center gap-1.5 text-xs bg-green-900/40 text-green-400 border border-green-800 px-2.5 py-1 rounded-full w-fit">
                            <Star className="w-3 h-3 fill-green-400" /> CON BONO
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs bg-red-900/40 text-red-400 border border-red-800 px-2.5 py-1 rounded-full w-fit">
                            <XCircle className="w-3 h-3" /> SIN BONO
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">
                        {emp.last_calculated
                          ? new Date(emp.last_calculated).toLocaleDateString('es-PE')
                          : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEmployee && selectedPeriodId && (
        <KpiEmployeeModal
          employee={selectedEmployee}
          periodId={selectedPeriodId}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  )
}
