'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

type Cycle = { id: string; name: string; start_year: number; end_year: number }
type ActionRow = { id: string; code?: string; name?: string; progress: number | null }
type StrategyRow = { id: string; code?: string; name?: string; progress: number | null; actions: ActionRow[] }
type ObjectiveRow = { id: string; code?: string; name?: string; progress: number | null; strategies: StrategyRow[] }
type DimensionRow = { id: string; code: string; name: string; progress: number | null; objectives: ObjectiveRow[] }

function semaforo(progress: number | null) {
  if (progress === null) return { label: 'Sin datos', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' }
  if (progress >= 100) return { label: 'Verde', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
  if (progress >= 90) return { label: 'Amarillo', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' }
  if (progress >= 75) return { label: 'Naranja', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' }
  return { label: 'Rojo', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
}

function ProgressBadge({ progress }: { progress: number | null }) {
  const s = semaforo(progress)
  return (
    <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {progress === null ? 'Sin datos' : `${Math.round(progress)}%`}
    </span>
  )
}

export function PlanDashboard({ cycles }: { cycles: Cycle[] }) {
  const [selectedCycleId, setSelectedCycleId] = useState(cycles[0]?.id ?? '')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [data, setData] = useState<DimensionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDim, setExpandedDim] = useState<Record<string, boolean>>({})
  const [expandedObj, setExpandedObj] = useState<Record<string, boolean>>({})
  const [expandedStrat, setExpandedStrat] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!selectedCycleId || !year) return
    setLoading(true)
    fetch(`/api/planning/dashboard?cycle_id=${selectedCycleId}&year=${year}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
  }, [selectedCycleId, year])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard del Plan Estratégico</h1>
        <p className="text-sm text-gray-500 mt-0.5">Semáforo de avance por Dimensión, Objetivo, Estrategia y Acción</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <select value={selectedCycleId} onChange={e => setSelectedCycleId(e.target.value)}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <input type="number" value={year} onChange={e => setYear(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> ≥100%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /> 90-99%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> 75-89%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt;75%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> Sin datos</span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          No hay datos para este ciclo/año.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map(dim => {
            const isDimOpen = expandedDim[dim.id] ?? false
            return (
              <div key={dim.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedDim(p => ({ ...p, [dim.id]: !isDimOpen }))}>
                  {isDimOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <p className="flex-1 text-sm font-semibold text-gray-900"><span className="text-blue-600 mr-1.5">{dim.code}</span>{dim.name}</p>
                  <ProgressBadge progress={dim.progress} />
                </div>
                {isDimOpen && (
                  <div className="border-t border-gray-100 px-4 py-2 pl-8 space-y-1.5">
                    {dim.objectives.map(obj => {
                      const isObjOpen = expandedObj[obj.id] ?? false
                      return (
                        <div key={obj.id} className="border border-gray-100 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedObj(p => ({ ...p, [obj.id]: !isObjOpen }))}>
                            {isObjOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            <p className="flex-1 text-sm text-gray-800"><span className="text-indigo-600 mr-1.5 font-medium">{obj.code}</span>{obj.name}</p>
                            <ProgressBadge progress={obj.progress} />
                          </div>
                          {isObjOpen && (
                            <div className="border-t border-gray-100 px-3 py-2 pl-7 space-y-1.5 bg-gray-50/50">
                              {obj.strategies.map(strat => {
                                const isStratOpen = expandedStrat[strat.id] ?? false
                                return (
                                  <div key={strat.id} className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                                    <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedStrat(p => ({ ...p, [strat.id]: !isStratOpen }))}>
                                      {isStratOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                      <p className="flex-1 text-sm text-gray-800"><span className="text-purple-600 mr-1.5 font-medium">{strat.code}</span>{strat.name}</p>
                                      <ProgressBadge progress={strat.progress} />
                                    </div>
                                    {isStratOpen && (
                                      <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
                                        {strat.actions.map(action => (
                                          <div key={action.id} className="flex items-center gap-3 px-2 py-1.5">
                                            <p className="flex-1 text-xs text-gray-700"><span className="text-gray-400 mr-1.5">{action.code}</span>{action.name}</p>
                                            <ProgressBadge progress={action.progress} />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
