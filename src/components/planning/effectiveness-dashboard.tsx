'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, TrendingUp, TrendingDown, Minus, Zap, Calculator } from 'lucide-react'

interface EffectivenessPlan { id: string; name: string; year: number }
interface AcademicYear { id: string; name: string; start_date: string; end_date: string }
interface AcademicSemester { id: string; academic_year_id: string; name: string; start_date: string; end_date: string }

interface PlanKPI {
  id: string; kpi_id: string
  link_type: string | null; link_label: string | null
  meta_operator: string | null; meta: number | null; responsible_id: string | null
  resultado: number | null; resultado_updated_at: string | null
  kpi: {
    code: string; level: string; name: string; formula?: string
    value_type: string; frequency: string; formula_type: string | null
  } | null
  responsible: { id: string; full_name: string } | null
}

const LEVEL_COLORS: Record<string, string> = {
  institucional: 'bg-purple-100 text-purple-700',
  estrategico: 'bg-blue-100 text-blue-700',
  operativo: 'bg-green-100 text-green-700',
}

const FORMULA_LABELS: Record<string, string> = {
  faculty_nationality_diversity: 'Diversidad docente',
  capacitacion_beneficiados_administrativa: 'Cap. administrativa',
  capacitacion_beneficiados_tecnologica: 'Cap. tecnológica',
  capacitacion_beneficiados_academica: 'Cap. académica',
  capacitacion_beneficiados_etica: 'Cap. ética e inclusión',
  desk_csat_promedio: 'CSAT administrativo',
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

function calcPct(k: PlanKPI): number | null {
  if (k.resultado == null || k.meta == null || k.meta === 0) return null
  const op = k.meta_operator ?? '>='
  if (op === '<' || op === '<=') return Math.min((k.meta / k.resultado) * 100, 200)
  if (op === '=') return k.resultado === k.meta ? 100 : (k.resultado / k.meta) * 100
  return Math.min((k.resultado / k.meta) * 100, 200)
}

export function EffectivenessDashboard({ plans }: { plans: EffectivenessPlan[] }) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? '')
  const [kpis, setKpis] = useState<PlanKPI[]>([])
  const [loading, setLoading] = useState(false)

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [semesters, setSemesters] = useState<AcademicSemester[]>([])
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('all')
  const [calculating, setCalculating] = useState(false)
  const [calcMsg, setCalcMsg] = useState<string | null>(null)

  // Load plan KPIs
  useEffect(() => {
    if (!selectedPlanId) return
    setLoading(true)
    fetch(`/api/planning/effectiveness/plan-kpis?plan_id=${selectedPlanId}`)
      .then(r => r.json())
      .then((d: PlanKPI[]) => { setKpis(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedPlanId])

  // Load academic years
  useEffect(() => {
    fetch('/api/academic/years')
      .then(r => r.json())
      .then((d: AcademicYear[]) => {
        setAcademicYears(d)
        if (d.length > 0) setSelectedYearId(d[0].id)
      })
      .catch(() => {})
  }, [])

  // Load semesters when year changes
  useEffect(() => {
    if (!selectedYearId) return
    fetch(`/api/academic/semesters?year_id=${selectedYearId}`)
      .then(r => r.json())
      .then((d: AcademicSemester[]) => { setSemesters(d); setSelectedSemesterId('all') })
      .catch(() => {})
  }, [selectedYearId])

  // Resolve date range from current selection
  function getDateRange(): { start: string; end: string } | null {
    if (!selectedYearId) return null
    if (selectedSemesterId !== 'all') {
      const sem = semesters.find(s => s.id === selectedSemesterId)
      if (!sem) return null
      return { start: sem.start_date, end: sem.end_date }
    }
    const yr = academicYears.find(y => y.id === selectedYearId)
    if (!yr) return null
    return { start: yr.start_date, end: yr.end_date }
  }

  const handleCalculate = useCallback(async () => {
    const range = getDateRange()
    if (!range) return

    const autoKpis = kpis.filter(k => k.kpi?.formula_type)
    if (autoKpis.length === 0) {
      setCalcMsg('No hay KPIs con cálculo automático en este plan.')
      setTimeout(() => setCalcMsg(null), 4000)
      return
    }

    setCalculating(true); setCalcMsg(null)
    try {
      const res = await fetch(`/api/planning/effectiveness/calculate?start_date=${range.start}&end_date=${range.end}`)
      const calcResults = await res.json() as Record<string, number>

      // Update each auto KPI
      const updates = autoKpis.filter(k => k.kpi?.formula_type && calcResults[k.kpi.formula_type] !== undefined)
      await Promise.all(updates.map(k =>
        fetch('/api/planning/effectiveness/plan-kpis', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: k.id,
            resultado: calcResults[k.kpi!.formula_type!],
            resultado_updated_at: new Date().toISOString().split('T')[0],
          }),
        })
      ))

      // Refresh KPIs
      const refreshed = await fetch(`/api/planning/effectiveness/plan-kpis?plan_id=${selectedPlanId}`).then(r => r.json()) as PlanKPI[]
      setKpis(refreshed)
      setCalcMsg(`${updates.length} KPI${updates.length !== 1 ? 's' : ''} calculado${updates.length !== 1 ? 's' : ''} correctamente.`)
    } catch {
      setCalcMsg('Error al calcular. Intenta de nuevo.')
    } finally {
      setCalculating(false)
      setTimeout(() => setCalcMsg(null), 5000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis, selectedPlanId, selectedYearId, selectedSemesterId, semesters, academicYears])

  const selectedPlan = plans.find(p => p.id === selectedPlanId)
  const withResult = kpis.filter(k => calcPct(k) != null)
  const pcts = withResult.map(k => calcPct(k)!)
  const avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  const greenCount = pcts.filter(p => p >= 90).length
  const yellowCount = pcts.filter(p => p >= 70 && p < 90).length
  const redCount = pcts.filter(p => p < 70).length
  const autoKpisCount = kpis.filter(k => k.kpi?.formula_type).length

  const selectedYearName = academicYears.find(y => y.id === selectedYearId)?.name ?? ''
  const selectedSemName = selectedSemesterId === 'all' ? 'Todos los semestres' : semesters.find(s => s.id === selectedSemesterId)?.name ?? ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Dashboard de Efectividad</h2>
          <p className="text-sm text-gray-500">Resultados vs metas por KPI</p>
        </div>
        {plans.length > 0 && (
          <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.year})</option>)}
          </select>
        )}
      </div>

      {/* Academic period selectors + calculate */}
      {plans.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Horizonte de tiempo para cálculo automático</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Año académico</label>
              <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]">
                <option value="">Seleccionar año…</option>
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Semestre</label>
              <select value={selectedSemesterId} onChange={e => setSelectedSemesterId(e.target.value)}
                disabled={!selectedYearId}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px] disabled:opacity-50">
                <option value="all">Todos los semestres</option>
                {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 invisible">Calcular</label>
              <button onClick={handleCalculate} disabled={!selectedYearId || calculating || autoKpisCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                {calculating ? 'Calculando…' : `Calcular KPIs automáticos${autoKpisCount > 0 ? ` (${autoKpisCount})` : ''}`}
              </button>
            </div>
          </div>
          {calcMsg && (
            <p className={`mt-2 text-sm px-3 py-2 rounded-lg ${calcMsg.includes('Error') || calcMsg.includes('No hay') ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
              {calcMsg}
            </p>
          )}
          {selectedYearId && (
            <p className="mt-2 text-xs text-gray-400">
              Periodo: <span className="font-medium text-gray-600">{selectedYearName}</span>
              {selectedSemesterId !== 'all' && <> · <span className="font-medium text-gray-600">{selectedSemName}</span></>}
            </p>
          )}
        </div>
      )}

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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-20">Meta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Resultado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-40">% Éxito</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Responsable</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Actualización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kpis.map(pk => {
                const pct = calcPct(pk)
                const vt = pk.kpi?.value_type ?? 'decimal'
                const hasAuto = !!pk.kpi?.formula_type
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
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-900">{pk.kpi?.name ?? '—'}</p>
                      {hasAuto && (
                        <span className="inline-flex items-center gap-1 mt-0.5 text-xs text-blue-600">
                          <Zap className="w-3 h-3" />
                          {FORMULA_LABELS[pk.kpi!.formula_type!] ?? pk.kpi!.formula_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 font-mono">
                      {pk.meta != null ? `${pk.meta_operator ?? '>='} ${formatValue(pk.meta, vt)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 font-semibold">
                      {pk.resultado != null ? formatValue(pk.resultado, vt) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {pct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className={`h-2 rounded-full transition-all ${getPctColor(pct)}`}
                              style={{ width: `${Math.min(pct, 100)}%` }} />
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
