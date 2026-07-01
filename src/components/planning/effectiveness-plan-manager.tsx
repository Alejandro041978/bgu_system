'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Target, Pencil, Check, X } from 'lucide-react'

interface EffectivenessPlan {
  id: string; name: string; year: number; description?: string; created_at: string
}
interface KPICatalog {
  id: string; code: string; level: string; name: string; value_type: string; frequency: string
}
interface Employee { id: string; full_name: string }
interface LinkableItem { id: string; label: string }

interface PlanKPI {
  id: string; plan_id: string; kpi_id: string
  link_type: string | null; link_id: string | null
  meta_operator: string | null; meta: number | null; responsible_id: string | null
  resultado: number | null; resultado_updated_at: string | null
  kpi: KPICatalog | null
  responsible: Employee | null
}

const LINK_TYPES = [
  { value: 'objetivo', label: 'Objetivo estratégico' },
  { value: 'accion_estrategica', label: 'Acción estratégica' },
  { value: 'accion_responsable', label: 'Acción por responsable' },
]

const LEVEL_COLORS: Record<string, string> = {
  institucional: 'bg-purple-100 text-purple-700',
  estrategico: 'bg-blue-100 text-blue-700',
  operativo: 'bg-green-100 text-green-700',
}

export function EffectivenessPlanManager({
  kpiCatalog, employees,
}: {
  kpiCatalog: KPICatalog[]; employees: Employee[]
}) {
  const [plans, setPlans] = useState<EffectivenessPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<EffectivenessPlan | null>(null)
  const [planKPIs, setPlanKPIs] = useState<PlanKPI[]>([])
  const [loadingKPIs, setLoadingKPIs] = useState(false)

  // new plan form
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [planForm, setPlanForm] = useState({ name: '', year: new Date().getFullYear(), description: '' })
  const [planSaving, setPlanSaving] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  // add KPI to plan form
  const [showAddKPI, setShowAddKPI] = useState(false)
  const [addForm, setAddForm] = useState({ kpi_id: '', link_type: '', link_id: '', meta_operator: '>=', meta: '', responsible_id: '' })
  const [linkItems, setLinkItems] = useState<LinkableItem[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // inline edit for resultado
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editResult, setEditResult] = useState({ resultado: '', resultado_updated_at: '' })
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    fetch('/api/planning/effectiveness/plans')
      .then(r => r.json())
      .then((d: EffectivenessPlan[]) => { setPlans(d); setLoadingPlans(false) })
      .catch(() => setLoadingPlans(false))
  }, [])

  const loadPlanKPIs = useCallback(async (planId: string) => {
    setLoadingKPIs(true)
    const res = await fetch(`/api/planning/effectiveness/plan-kpis?plan_id=${planId}`)
    const data = await res.json() as PlanKPI[]
    setPlanKPIs(data)
    setLoadingKPIs(false)
  }, [])

  function selectPlan(plan: EffectivenessPlan) {
    setSelectedPlan(plan); setPlanKPIs([]); setShowAddKPI(false)
    loadPlanKPIs(plan.id)
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault(); setPlanSaving(true); setPlanError(null)
    try {
      const res = await fetch('/api/planning/effectiveness/plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planForm),
      })
      const data = await res.json() as EffectivenessPlan & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al crear plan')
      setPlans(prev => [data, ...prev])
      setShowPlanForm(false)
      setPlanForm({ name: '', year: new Date().getFullYear(), description: '' })
      selectPlan(data)
    } catch (err) { setPlanError(String(err)) }
    finally { setPlanSaving(false) }
  }

  // Load linkable items when link_type changes
  useEffect(() => {
    if (!addForm.link_type || !selectedPlan) { setLinkItems([]); return }
    setLoadingLinks(true)
    fetch(`/api/planning/effectiveness/linkable?plan_year=${selectedPlan.year}&link_type=${addForm.link_type}`)
      .then(r => r.json())
      .then((d: LinkableItem[]) => { setLinkItems(d); setLoadingLinks(false) })
      .catch(() => setLoadingLinks(false))
  }, [addForm.link_type, selectedPlan])

  async function addKPIToPlan(e: React.FormEvent) {
    e.preventDefault(); if (!selectedPlan) return
    setAddSaving(true); setAddError(null)
    try {
      const res = await fetch('/api/planning/effectiveness/plan-kpis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: selectedPlan.id,
          kpi_id: addForm.kpi_id,
          link_type: addForm.link_type || null,
          link_id: addForm.link_id || null,
          meta_operator: addForm.meta_operator || '>=',
          meta: addForm.meta ? parseFloat(addForm.meta) : null,
          responsible_id: addForm.responsible_id || null,
        }),
      })
      const data = await res.json() as { error?: string; id?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al agregar KPI')
      setShowAddKPI(false)
      setAddForm({ kpi_id: '', link_type: '', link_id: '', meta: '', responsible_id: '' })
      loadPlanKPIs(selectedPlan.id)
    } catch (err) { setAddError(String(err)) }
    finally { setAddSaving(false) }
  }

  async function saveResult(pk: PlanKPI) {
    setEditSaving(true)
    const res = await fetch('/api/planning/effectiveness/plan-kpis', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pk.id,
        resultado: editResult.resultado !== '' ? parseFloat(editResult.resultado) : null,
        resultado_updated_at: editResult.resultado_updated_at || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json() as PlanKPI
      setPlanKPIs(prev => prev.map(p => p.id === pk.id ? { ...p, resultado: updated.resultado, resultado_updated_at: updated.resultado_updated_at } : p))
      setEditingId(null)
    } else {
      const d = await res.json() as { error?: string }
      alert(d.error ?? 'Error al guardar resultado')
    }
    setEditSaving(false)
  }

  async function removeKPI(id: string) {
    if (!confirm('¿Quitar este KPI del plan?')) return
    const res = await fetch('/api/planning/effectiveness/plan-kpis', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setPlanKPIs(prev => prev.filter(p => p.id !== id))
    else { const d = await res.json() as { error?: string }; alert(d.error ?? 'Error') }
  }

  const empName = (id?: string | null) => employees.find(e => e.id === id)?.full_name ?? '—'

  return (
    <div className="flex gap-6">
      {/* Plan list */}
      <div className="w-72 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Planes</h3>
          <button onClick={() => setShowPlanForm(o => !o)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> Nuevo plan
          </button>
        </div>

        {showPlanForm && (
          <form onSubmit={createPlan} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Nuevo plan anual</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Nombre *</label>
              <input required value={planForm.name}
                onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Plan Efectividad 2026" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Año *</label>
              <input required type="number" min={2020} max={2099} value={planForm.year}
                onChange={e => setPlanForm(p => ({ ...p, year: parseInt(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Descripción</label>
              <textarea rows={2} value={planForm.description}
                onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            {planError && <p className="text-xs text-red-600">{planError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowPlanForm(false); setPlanError(null) }}
                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={planSaving}
                className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {planSaving ? 'Guardando...' : 'Crear'}
              </button>
            </div>
          </form>
        )}

        {loadingPlans ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : plans.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">Sin planes aún.</p>
        ) : (
          <div className="space-y-2">
            {plans.map(plan => (
              <button key={plan.id} onClick={() => selectPlan(plan)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${selectedPlan?.id === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <Target className={`w-4 h-4 flex-shrink-0 ${selectedPlan?.id === plan.id ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedPlan?.id === plan.id ? 'text-blue-700' : 'text-gray-900'}`}>{plan.name}</p>
                    <p className="text-xs text-gray-500">{plan.year}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPIs panel */}
      <div className="flex-1 min-w-0">
        {!selectedPlan ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
            <Target className="w-10 h-10 text-gray-300" />
            <p className="text-sm">Selecciona un plan para gestionar sus KPIs</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selectedPlan.name}</h3>
                <p className="text-sm text-gray-500">Año {selectedPlan.year}{selectedPlan.description ? ` · ${selectedPlan.description}` : ''}</p>
              </div>
              <button onClick={() => setShowAddKPI(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Vincular KPI
              </button>
            </div>

            {showAddKPI && (
              <form onSubmit={addKPIToPlan} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <p className="text-sm font-semibold text-gray-800">Vincular KPI al plan</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">KPI *</label>
                    <select required value={addForm.kpi_id}
                      onChange={e => setAddForm(p => ({ ...p, kpi_id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">— Seleccionar KPI —</option>
                      {kpiCatalog.map(k => (
                        <option key={k.id} value={k.id}>{k.code} · {k.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de vinculación</label>
                    <select value={addForm.link_type}
                      onChange={e => setAddForm(p => ({ ...p, link_type: e.target.value, link_id: '' }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">— Sin vinculación —</option>
                      {LINK_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>

                  {addForm.link_type && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {LINK_TYPES.find(l => l.value === addForm.link_type)?.label}
                      </label>
                      {loadingLinks ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
                        </div>
                      ) : (
                        <select value={addForm.link_id}
                          onChange={e => setAddForm(p => ({ ...p, link_id: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">— Seleccionar —</option>
                          {linkItems.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                        </select>
                      )}
                      {!loadingLinks && linkItems.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">No se encontraron elementos para el año {selectedPlan.year}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Meta</label>
                    <div className="flex gap-2">
                      <select value={addForm.meta_operator}
                        onChange={e => setAddForm(p => ({ ...p, meta_operator: e.target.value }))}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {['>=', '>', '<=', '<', '='].map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                      <input type="number" step="any" value={addForm.meta}
                        onChange={e => setAddForm(p => ({ ...p, meta: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ej. 85" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Responsable</label>
                    <select value={addForm.responsible_id}
                      onChange={e => setAddForm(p => ({ ...p, responsible_id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">— Sin asignar —</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                    </select>
                  </div>
                </div>
                {addError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}
                <div className="flex justify-end gap-3">
                  <button type="button"
                    onClick={() => { setShowAddKPI(false); setAddForm({ kpi_id: '', link_type: '', link_id: '', meta_operator: '>=', meta: '', responsible_id: '' }); setAddError(null) }}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                  <button type="submit" disabled={addSaving}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {addSaving ? 'Guardando...' : 'Vincular'}
                  </button>
                </div>
              </form>
            )}

            {loadingKPIs ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : planKPIs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No hay KPIs vinculados a este plan.</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-20">Código</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Nivel</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">KPI</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Vinculación</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-20">Meta</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Responsable</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Resultado</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Actualización</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {planKPIs.map(pk => (
                      <tr key={pk.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{pk.kpi?.code ?? '—'}</td>
                        <td className="px-4 py-3">
                          {pk.kpi && (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[pk.kpi.level] ?? 'bg-gray-100 text-gray-600'}`}>
                              {pk.kpi.level === 'institucional' ? 'Inst.' : pk.kpi.level === 'estrategico' ? 'Estrat.' : 'Oper.'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-900 text-xs">{pk.kpi?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {pk.link_type ? LINK_TYPES.find(l => l.value === pk.link_type)?.label ?? pk.link_type : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-700 font-mono">
                          {pk.meta != null ? `${pk.meta_operator ?? '>='} ${pk.meta}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{empName(pk.responsible_id)}</td>
                        <td className="px-4 py-3">
                          {editingId === pk.id ? (
                            <input type="number" step="any" autoFocus
                              value={editResult.resultado}
                              onChange={e => setEditResult(p => ({ ...p, resultado: e.target.value }))}
                              className="w-20 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          ) : (
                            <span className="text-xs font-medium text-gray-700">{pk.resultado != null ? pk.resultado : '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === pk.id ? (
                            <input type="date"
                              value={editResult.resultado_updated_at}
                              onChange={e => setEditResult(p => ({ ...p, resultado_updated_at: e.target.value }))}
                              className="w-28 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          ) : (
                            <span className="text-xs text-gray-500">{pk.resultado_updated_at ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {editingId === pk.id ? (
                              <>
                                <button onClick={() => saveResult(pk)} disabled={editSaving}
                                  className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="p-1 text-gray-400 hover:text-gray-600">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => {
                                  setEditingId(pk.id)
                                  setEditResult({
                                    resultado: pk.resultado != null ? String(pk.resultado) : '',
                                    resultado_updated_at: pk.resultado_updated_at ?? '',
                                  })
                                }}
                                  className="p-1 text-gray-400 hover:text-blue-500 transition-colors" title="Registrar resultado">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => removeKPI(pk.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Quitar KPI">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
