'use client'

import { useState } from 'react'
import {
  Plus, ChevronDown, ChevronRight, Trash2, Pencil, Check, X, Target,
  Layers, ListChecks, UserCheck, History, Loader2,
} from 'lucide-react'

type Employee = { id: string; full_name: string; position: string | null }
type Responsible = {
  id: string; role: string; assigned_from_year: number; assigned_to_year: number | null
  code: string | null; name: string | null; years: number[]
  status: string; progress_pct: number | null; notes: string | null; employee: Employee
}

function parseYears(input: string): number[] {
  return Array.from(new Set(input.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 1900))).sort((a, b) => a - b)
}
type Action = {
  id: string; code: string; name: string; description: string | null
  start_year: number | null; target_close_year: number | null; progress_pct: number | null
  valid_from_year: number; status: string; responsibles: Responsible[]
}
type Strategy = { id: string; code: string; name: string; description: string | null; valid_from_year: number }
type Objective = { id: string; code: string; name: string; description: string | null; valid_from_year: number }
type Dimension = { id: string; code: string; name: string; description: string | null; valid_from_year: number }
type Cycle = { id: string; name: string; start_year: number; end_year: number; status: string }

function emptyRevise() { return { name: '', description: '', valid_from_year: new Date().getFullYear(), change_reason: '' } }

export function StrategicPlanManager({ cycles, faculty }: { cycles: Cycle[]; faculty: Employee[] }) {
  const [selectedCycleId, setSelectedCycleId] = useState(cycles[0]?.id ?? '')

  // New cycle form
  const [showCycleForm, setShowCycleForm] = useState(false)
  const [cycleForm, setCycleForm] = useState({ name: '', start_year: '', end_year: '' })
  const [savingCycle, setSavingCycle] = useState(false)
  const [allCycles, setAllCycles] = useState(cycles)

  // Dimensions
  const [dimensions, setDimensions] = useState<Dimension[]>([])
  const [loadingDims, setLoadingDims] = useState(false)
  const [dimLoaded, setDimLoaded] = useState(false)
  const [showDimForm, setShowDimForm] = useState(false)
  const [dimForm, setDimForm] = useState({ code: '', name: '', valid_from_year: new Date().getFullYear() })

  // Expand state per level
  const [expandedDim, setExpandedDim] = useState<Record<string, boolean>>({})
  const [expandedObj, setExpandedObj] = useState<Record<string, boolean>>({})
  const [expandedStrat, setExpandedStrat] = useState<Record<string, boolean>>({})
  const [expandedAction, setExpandedAction] = useState<Record<string, boolean>>({})

  // Children data keyed by parent id
  const [objectivesByDim, setObjectivesByDim] = useState<Record<string, Objective[]>>({})
  const [strategiesByObj, setStrategiesByObj] = useState<Record<string, Strategy[]>>({})
  const [actionsByStrat, setActionsByStrat] = useState<Record<string, Action[]>>({})

  // Add-forms per parent
  const [showObjForm, setShowObjForm] = useState<Record<string, boolean>>({})
  const [objForm, setObjForm] = useState<Record<string, { code: string; name: string; valid_from_year: string }>>({})
  const [showStratForm, setShowStratForm] = useState<Record<string, boolean>>({})
  const [stratForm, setStratForm] = useState<Record<string, { code: string; name: string; valid_from_year: string }>>({})
  const [showActionForm, setShowActionForm] = useState<Record<string, boolean>>({})
  const [actionForm, setActionForm] = useState<Record<string, { code: string; name: string; start_year: string; target_close_year: string; valid_from_year: string }>>({})

  // Revise (versioning) modal state: { level, id, parentId }
  const [revising, setRevising] = useState<{ level: 'dimension' | 'objective' | 'strategy' | 'action'; id: string; parentId: string } | null>(null)
  const [reviseForm, setReviseForm] = useState(emptyRevise())
  const [savingRevise, setSavingRevise] = useState(false)

  // Responsible assignment per action
  const [assigningAction, setAssigningAction] = useState<string | null>(null)
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assignForm, setAssignForm] = useState({ code: '', name: '', years: '' })

  // Inline edit of a responsible action's code/name/year
  const [editingResp, setEditingResp] = useState<{ id: string; actionId: string; stratId: string } | null>(null)
  const [respEditForm, setRespEditForm] = useState({ code: '', name: '', years: '' })

  // Quick code edit (no versioning, code is just an identifier)
  const [editingCode, setEditingCode] = useState<{ level: 'dimension' | 'objective' | 'strategy' | 'action'; id: string; parentId: string } | null>(null)
  const [codeValue, setCodeValue] = useState('')

  const currentYear = new Date().getFullYear()

  function startEditCode(level: 'dimension' | 'objective' | 'strategy' | 'action', id: string, parentId: string, code: string) {
    setEditingCode({ level, id, parentId })
    setCodeValue(code)
  }

  async function saveCode() {
    if (!editingCode || !codeValue) return
    const path = { dimension: 'dimensions', objective: 'objectives', strategy: 'strategies', action: 'actions' }[editingCode.level]
    const res = await fetch(`/api/planning/${path}/${editingCode.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codeValue }),
    })
    const data = await res.json()
    if (res.ok) {
      if (editingCode.level === 'dimension') setDimensions(prev => prev.map(d => d.id === editingCode.id ? data : d))
      if (editingCode.level === 'objective') setObjectivesByDim(prev => ({ ...prev, [editingCode.parentId]: (prev[editingCode.parentId] ?? []).map(o => o.id === editingCode.id ? data : o) }))
      if (editingCode.level === 'strategy') setStrategiesByObj(prev => ({ ...prev, [editingCode.parentId]: (prev[editingCode.parentId] ?? []).map(s => s.id === editingCode.id ? data : s) }))
      if (editingCode.level === 'action') setActionsByStrat(prev => ({ ...prev, [editingCode.parentId]: (prev[editingCode.parentId] ?? []).map(a => a.id === editingCode.id ? data : a) }))
      setEditingCode(null)
    }
  }

  async function createCycle() {
    setSavingCycle(true)
    const res = await fetch('/api/planning/cycles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cycleForm.name, start_year: Number(cycleForm.start_year), end_year: Number(cycleForm.end_year) }),
    })
    const data = await res.json()
    if (res.ok) {
      setAllCycles(prev => [data, ...prev])
      setSelectedCycleId(data.id)
      setCycleForm({ name: '', start_year: '', end_year: '' })
      setShowCycleForm(false)
      setDimLoaded(false)
    }
    setSavingCycle(false)
  }

  async function loadDimensions() {
    if (!selectedCycleId) return
    setLoadingDims(true)
    const res = await fetch(`/api/planning/dimensions?cycle_id=${selectedCycleId}`)
    const data = await res.json()
    setDimensions(Array.isArray(data) ? data : [])
    setLoadingDims(false)
    setDimLoaded(true)
  }

  if (selectedCycleId && !dimLoaded && !loadingDims) loadDimensions()

  async function createDimension() {
    const res = await fetch('/api/planning/dimensions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle_id: selectedCycleId, code: dimForm.code, name: dimForm.name, valid_from_year: dimForm.valid_from_year }),
    })
    const data = await res.json()
    if (res.ok) {
      setDimensions(prev => [...prev, data])
      setDimForm({ code: '', name: '', valid_from_year: currentYear })
      setShowDimForm(false)
    }
  }

  async function deleteDimension(id: string) {
    if (!confirm('¿Eliminar esta dimensión y todo su contenido?')) return
    await fetch(`/api/planning/dimensions/${id}`, { method: 'DELETE' })
    setDimensions(prev => prev.filter(d => d.id !== id))
  }

  async function loadObjectives(dimId: string) {
    const res = await fetch(`/api/planning/objectives?dimension_id=${dimId}`)
    const data = await res.json()
    setObjectivesByDim(prev => ({ ...prev, [dimId]: Array.isArray(data) ? data : [] }))
  }

  function toggleDim(dimId: string) {
    const next = !(expandedDim[dimId] ?? false)
    setExpandedDim(prev => ({ ...prev, [dimId]: next }))
    if (next && !objectivesByDim[dimId]) loadObjectives(dimId)
  }

  async function createObjective(dimId: string) {
    const form = objForm[dimId] ?? { code: '', name: '', valid_from_year: '' }
    const res = await fetch('/api/planning/objectives', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimension_id: dimId, code: form.code, name: form.name, valid_from_year: Number(form.valid_from_year) || currentYear }),
    })
    const data = await res.json()
    if (res.ok) {
      setObjectivesByDim(prev => ({ ...prev, [dimId]: [...(prev[dimId] ?? []), data] }))
      setObjForm(prev => ({ ...prev, [dimId]: { code: '', name: '', valid_from_year: '' } }))
      setShowObjForm(prev => ({ ...prev, [dimId]: false }))
    }
  }

  async function deleteObjective(id: string, dimId: string) {
    if (!confirm('¿Eliminar este objetivo y todo su contenido?')) return
    await fetch(`/api/planning/objectives/${id}`, { method: 'DELETE' })
    setObjectivesByDim(prev => ({ ...prev, [dimId]: (prev[dimId] ?? []).filter(o => o.id !== id) }))
  }

  async function loadStrategies(objId: string) {
    const res = await fetch(`/api/planning/strategies?objective_id=${objId}`)
    const data = await res.json()
    setStrategiesByObj(prev => ({ ...prev, [objId]: Array.isArray(data) ? data : [] }))
  }

  function toggleObj(objId: string) {
    const next = !(expandedObj[objId] ?? false)
    setExpandedObj(prev => ({ ...prev, [objId]: next }))
    if (next && !strategiesByObj[objId]) loadStrategies(objId)
  }

  async function createStrategy(objId: string) {
    const form = stratForm[objId] ?? { code: '', name: '', valid_from_year: '' }
    const res = await fetch('/api/planning/strategies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective_id: objId, code: form.code, name: form.name, valid_from_year: Number(form.valid_from_year) || currentYear }),
    })
    const data = await res.json()
    if (res.ok) {
      setStrategiesByObj(prev => ({ ...prev, [objId]: [...(prev[objId] ?? []), data] }))
      setStratForm(prev => ({ ...prev, [objId]: { code: '', name: '', valid_from_year: '' } }))
      setShowStratForm(prev => ({ ...prev, [objId]: false }))
    }
  }

  async function deleteStrategy(id: string, objId: string) {
    if (!confirm('¿Eliminar esta estrategia y todas sus acciones?')) return
    await fetch(`/api/planning/strategies/${id}`, { method: 'DELETE' })
    setStrategiesByObj(prev => ({ ...prev, [objId]: (prev[objId] ?? []).filter(s => s.id !== id) }))
  }

  async function loadActions(stratId: string) {
    const res = await fetch(`/api/planning/actions?strategy_id=${stratId}`)
    const data = await res.json()
    setActionsByStrat(prev => ({ ...prev, [stratId]: Array.isArray(data) ? data : [] }))
  }

  function toggleStrat(stratId: string) {
    const next = !(expandedStrat[stratId] ?? false)
    setExpandedStrat(prev => ({ ...prev, [stratId]: next }))
    if (next && !actionsByStrat[stratId]) loadActions(stratId)
  }

  async function createAction(stratId: string) {
    const form = actionForm[stratId] ?? { code: '', name: '', start_year: '', target_close_year: '', valid_from_year: '' }
    const res = await fetch('/api/planning/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy_id: stratId, code: form.code, name: form.name,
        start_year: form.start_year ? Number(form.start_year) : null,
        target_close_year: form.target_close_year ? Number(form.target_close_year) : null,
        valid_from_year: Number(form.valid_from_year) || currentYear,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setActionsByStrat(prev => ({ ...prev, [stratId]: [...(prev[stratId] ?? []), data] }))
      setActionForm(prev => ({ ...prev, [stratId]: { code: '', name: '', start_year: '', target_close_year: '', valid_from_year: '' } }))
      setShowActionForm(prev => ({ ...prev, [stratId]: false }))
    }
  }

  async function deleteAction(id: string, stratId: string) {
    if (!confirm('¿Eliminar esta acción?')) return
    await fetch(`/api/planning/actions/${id}`, { method: 'DELETE' })
    setActionsByStrat(prev => ({ ...prev, [stratId]: (prev[stratId] ?? []).filter(a => a.id !== id) }))
  }

  function openRevise(level: 'dimension' | 'objective' | 'strategy' | 'action', item: { name: string; description?: string | null; valid_from_year: number }, id: string, parentId: string) {
    setRevising({ level, id, parentId })
    setReviseForm({ name: item.name, description: item.description ?? '', valid_from_year: currentYear, change_reason: '' })
  }

  async function saveRevise() {
    if (!revising) return
    setSavingRevise(true)
    const path = { dimension: 'dimensions', objective: 'objectives', strategy: 'strategies', action: 'actions' }[revising.level]
    const res = await fetch(`/api/planning/${path}/${revising.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...reviseForm, revise: true }),
    })
    const data = await res.json()
    if (res.ok) {
      if (revising.level === 'dimension') setDimensions(prev => prev.map(d => d.id === revising.id ? data : d))
      if (revising.level === 'objective') setObjectivesByDim(prev => ({ ...prev, [revising.parentId]: (prev[revising.parentId] ?? []).map(o => o.id === revising.id ? data : o) }))
      if (revising.level === 'strategy') setStrategiesByObj(prev => ({ ...prev, [revising.parentId]: (prev[revising.parentId] ?? []).map(s => s.id === revising.id ? data : s) }))
      if (revising.level === 'action') setActionsByStrat(prev => ({ ...prev, [revising.parentId]: (prev[revising.parentId] ?? []).map(a => a.id === revising.id ? data : a) }))
      setRevising(null)
    }
    setSavingRevise(false)
  }

  async function assignResponsible(actionId: string, stratId: string) {
    const years = parseYears(assignForm.years)
    if (!assignEmployeeId || !assignForm.name || years.length === 0) return
    const res = await fetch('/api/planning/responsibles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_id: actionId, employee_id: assignEmployeeId,
        code: assignForm.code || null, name: assignForm.name,
        assigned_from_year: years[0], years,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setActionsByStrat(prev => ({
        ...prev,
        [stratId]: (prev[stratId] ?? []).map(a => a.id === actionId ? { ...a, responsibles: [...a.responsibles, data] } : a),
      }))
      setAssignForm({ code: '', name: '', years: '' })
      setAssigningAction(null)
      setAssignEmployeeId('')
    }
  }

  async function removeResponsible(respId: string, actionId: string, stratId: string) {
    await fetch(`/api/planning/responsibles/${respId}`, { method: 'DELETE' })
    setActionsByStrat(prev => ({
      ...prev,
      [stratId]: (prev[stratId] ?? []).map(a => a.id === actionId ? { ...a, responsibles: a.responsibles.filter(r => r.id !== respId) } : a),
    }))
  }

  async function updateResponsibleField(respId: string, actionId: string, stratId: string, patch: Partial<Responsible>) {
    const res = await fetch(`/api/planning/responsibles/${respId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (res.ok) {
      setActionsByStrat(prev => ({
        ...prev,
        [stratId]: (prev[stratId] ?? []).map(a => a.id === actionId
          ? { ...a, responsibles: a.responsibles.map(r => r.id === respId ? data : r) }
          : a),
      }))
    }
  }

  function startEditResp(r: Responsible, actionId: string, stratId: string) {
    setEditingResp({ id: r.id, actionId, stratId })
    setRespEditForm({ code: r.code ?? '', name: r.name ?? '', years: (r.years ?? []).join(', ') })
  }

  async function saveRespEdit() {
    if (!editingResp || !respEditForm.name) return
    const years = parseYears(respEditForm.years)
    if (years.length === 0) return
    await updateResponsibleField(editingResp.id, editingResp.actionId, editingResp.stratId, {
      code: respEditForm.code || null, name: respEditForm.name,
      assigned_from_year: years[0], years,
    })
    setEditingResp(null)
  }

  const selectedCycle = allCycles.find(c => c.id === selectedCycleId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Plan Estratégico</h1>
          <p className="text-sm text-gray-500 mt-0.5">Dimensiones, objetivos, estrategias y acciones con control de cambios</p>
        </div>
        <button onClick={() => setShowCycleForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nuevo ciclo de plan
        </button>
      </div>

      {showCycleForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">Nuevo ciclo de plan estratégico</p>
          <div className="grid grid-cols-3 gap-3">
            <input value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ej. Plan Estratégico 2023-2028"
              className="col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" value={cycleForm.start_year} onChange={e => setCycleForm(p => ({ ...p, start_year: e.target.value }))}
              placeholder="Año inicio" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" value={cycleForm.end_year} onChange={e => setCycleForm(p => ({ ...p, end_year: e.target.value }))}
              placeholder="Año fin" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={createCycle} disabled={!cycleForm.name || !cycleForm.start_year || !cycleForm.end_year || savingCycle}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
              {savingCycle ? 'Guardando...' : 'Crear ciclo'}
            </button>
            <button onClick={() => setShowCycleForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      {/* Selector de ciclo */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select value={selectedCycleId} onChange={e => { setSelectedCycleId(e.target.value); setDimLoaded(false) }}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {allCycles.length === 0 && <option value="">Sin ciclos</option>}
            {allCycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        {selectedCycle && <span className="text-xs text-gray-400">{selectedCycle.start_year}–{selectedCycle.end_year}</span>}
      </div>

      {!selectedCycleId ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          Crea un ciclo de plan estratégico para comenzar.
        </div>
      ) : loadingDims ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <div className="space-y-3">
          {dimensions.map(dim => {
            const isDimOpen = expandedDim[dim.id] ?? false
            const objectives = objectivesByDim[dim.id] ?? []
            return (
              <div key={dim.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 group" onClick={() => toggleDim(dim.id)}>
                  {isDimOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <Target className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1">
                    {editingCode?.level === 'dimension' && editingCode.id === dim.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input autoFocus value={codeValue} onChange={e => setCodeValue(e.target.value)}
                          className="w-20 border border-blue-300 rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button onClick={saveCode} className="p-1 text-blue-600 hover:text-blue-700"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingCode(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <p className="font-semibold text-gray-900 text-sm">
                        <span className="text-blue-600 mr-1.5">{dim.code}</span>{dim.name}
                        <button onClick={e => { e.stopPropagation(); startEditCode('dimension', dim.id, '', dim.code) }}
                          className="ml-1.5 p-0.5 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all align-middle"><Pencil className="w-3 h-3 inline" /></button>
                      </p>
                    )}
                    {dim.description && <p className="text-xs text-gray-400">{dim.description}</p>}
                  </div>
                  <span className="text-xs text-gray-400">desde {dim.valid_from_year}</span>
                  <button onClick={e => { e.stopPropagation(); openRevise('dimension', dim, dim.id, '') }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"><History className="w-3.5 h-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); deleteDimension(dim.id) }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                {isDimOpen && (
                  <div className="border-t border-gray-100 px-5 py-3 pl-10 space-y-2">
                    {objectives.map(obj => {
                      const isObjOpen = expandedObj[obj.id] ?? false
                      const strategies = strategiesByObj[obj.id] ?? []
                      return (
                        <div key={obj.id} className="border border-gray-100 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 group" onClick={() => toggleObj(obj.id)}>
                            {isObjOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            <Layers className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                            {editingCode?.level === 'objective' && editingCode.id === obj.id ? (
                              <div className="flex-1 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                <input autoFocus value={codeValue} onChange={e => setCodeValue(e.target.value)}
                                  className="w-20 border border-blue-300 rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                <button onClick={saveCode} className="p-1 text-blue-600 hover:text-blue-700"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditingCode(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <p className="flex-1 text-sm text-gray-800">
                                <span className="text-indigo-600 mr-1.5 font-medium">{obj.code}</span>{obj.name}
                                <button onClick={e => { e.stopPropagation(); startEditCode('objective', obj.id, dim.id, obj.code) }}
                                  className="ml-1.5 p-0.5 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all align-middle"><Pencil className="w-3 h-3 inline" /></button>
                                <span className="ml-2 text-xs text-gray-400 font-normal">desde {obj.valid_from_year}</span>
                              </p>
                            )}
                            <button onClick={e => { e.stopPropagation(); openRevise('objective', obj, obj.id, dim.id) }}
                              className="p-1 rounded text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"><History className="w-3 h-3" /></button>
                            <button onClick={e => { e.stopPropagation(); deleteObjective(obj.id, dim.id) }}
                              className="p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                          </div>

                          {isObjOpen && (
                            <div className="border-t border-gray-100 px-4 py-2.5 pl-8 space-y-2 bg-gray-50/50">
                              {strategies.map(strat => {
                                const isStratOpen = expandedStrat[strat.id] ?? false
                                const actions = actionsByStrat[strat.id] ?? []
                                return (
                                  <div key={strat.id} className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                                    <div className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 group" onClick={() => toggleStrat(strat.id)}>
                                      {isStratOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                      <ListChecks className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                                      {editingCode?.level === 'strategy' && editingCode.id === strat.id ? (
                                        <div className="flex-1 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                          <input autoFocus value={codeValue} onChange={e => setCodeValue(e.target.value)}
                                            className="w-20 border border-blue-300 rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                          <button onClick={saveCode} className="p-1 text-blue-600 hover:text-blue-700"><Check className="w-3.5 h-3.5" /></button>
                                          <button onClick={() => setEditingCode(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                      ) : (
                                        <p className="flex-1 text-sm text-gray-800">
                                          <span className="text-purple-600 mr-1.5 font-medium">{strat.code}</span>{strat.name}
                                          <button onClick={e => { e.stopPropagation(); startEditCode('strategy', strat.id, obj.id, strat.code) }}
                                            className="ml-1.5 p-0.5 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all align-middle"><Pencil className="w-3 h-3 inline" /></button>
                                          <span className="ml-2 text-xs text-gray-400 font-normal">desde {strat.valid_from_year}</span>
                                        </p>
                                      )}
                                      <button onClick={e => { e.stopPropagation(); openRevise('strategy', strat, strat.id, obj.id) }}
                                        className="p-1 rounded text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"><History className="w-3 h-3" /></button>
                                      <button onClick={e => { e.stopPropagation(); deleteStrategy(strat.id, obj.id) }}
                                        className="p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                                    </div>

                                    {isStratOpen && (
                                      <div className="border-t border-gray-100 px-4 py-2 space-y-2">
                                        {actions.map(action => {
                                          const isAssigning = assigningAction === action.id
                                          const isActionOpen = expandedAction[action.id] ?? false
                                          return (
                                            <div key={action.id} className="rounded-lg border border-gray-100 overflow-hidden group">
                                              <div className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedAction(p => ({ ...p, [action.id]: !isActionOpen }))}>
                                                {isActionOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 mt-0.5" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-0.5" />}
                                                <div className="flex-1">
                                                  {editingCode?.level === 'action' && editingCode.id === action.id ? (
                                                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                      <input autoFocus value={codeValue} onChange={e => setCodeValue(e.target.value)}
                                                        className="w-20 border border-blue-300 rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                      <button onClick={saveCode} className="p-1 text-blue-600 hover:text-blue-700"><Check className="w-3.5 h-3.5" /></button>
                                                      <button onClick={() => setEditingCode(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                  ) : (
                                                    <p className="text-sm font-medium text-gray-800">
                                                      <span className="text-gray-400 mr-1.5">{action.code}</span>{action.name}
                                                      <button onClick={e => { e.stopPropagation(); startEditCode('action', action.id, strat.id, action.code) }}
                                                        className="ml-1.5 p-0.5 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all align-middle"><Pencil className="w-3 h-3 inline" /></button>
                                                    </p>
                                                  )}
                                                  {(action.start_year || action.target_close_year) && (
                                                    <p className="text-xs text-gray-400 mt-0.5">{action.start_year ?? '—'} → {action.target_close_year ?? '—'} · desde {action.valid_from_year}</p>
                                                  )}
                                                </div>
                                                <span className="text-xs text-gray-400">{action.responsibles.length} responsable{action.responsibles.length === 1 ? '' : 's'}</span>
                                                <button onClick={e => { e.stopPropagation(); openRevise('action', action, action.id, strat.id) }}
                                                  className="p-1 rounded text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"><History className="w-3.5 h-3.5" /></button>
                                                <button onClick={e => { e.stopPropagation(); deleteAction(action.id, strat.id) }}
                                                  className="p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                              </div>

                                              {isActionOpen && (
                                                <div className="border-t border-gray-100 px-3 py-2 pl-9 space-y-2 bg-gray-50/50">
                                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones por responsable</p>
                                                  {action.responsibles.length === 0 && !isAssigning && (
                                                    <p className="text-xs text-gray-400">Sin responsables asignados todavía.</p>
                                                  )}
                                                  {action.responsibles.map(r => {
                                                    const isEditingResp = editingResp?.id === r.id
                                                    return isEditingResp ? (
                                                      <div key={r.id} className="bg-white border border-blue-200 rounded-lg p-2.5 space-y-2">
                                                        <div className="grid grid-cols-4 gap-2">
                                                          <input value={respEditForm.code} onChange={e => setRespEditForm(p => ({ ...p, code: e.target.value }))}
                                                            placeholder="Código" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                          <input value={respEditForm.name} onChange={e => setRespEditForm(p => ({ ...p, name: e.target.value }))}
                                                            placeholder="Descripción de la acción del responsable" className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                          <input value={respEditForm.years} onChange={e => setRespEditForm(p => ({ ...p, years: e.target.value }))}
                                                            placeholder="Años, ej. 2024, 2025, 2026" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        </div>
                                                        <div className="flex gap-2">
                                                          <button onClick={saveRespEdit} disabled={!respEditForm.name}
                                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg">Guardar</button>
                                                          <button onClick={() => setEditingResp(null)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                                                        </div>
                                                      </div>
                                                    ) : (
                                                      <div key={r.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 group/resp">
                                                        <UserCheck className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                          <p className="text-sm text-gray-800 truncate">
                                                            {r.code && <span className="text-gray-400 mr-1.5">{r.code}</span>}
                                                            {r.name ?? <span className="text-gray-400 italic">Sin descripción</span>}
                                                          </p>
                                                          <p className="text-xs text-gray-400">{r.employee.full_name}{r.employee.position ? ` — ${r.employee.position}` : ''} · años: {(r.years ?? []).length ? r.years.join(', ') : 'sin definir'}</p>
                                                        </div>
                                                        <button onClick={() => startEditResp(r, action.id, strat.id)}
                                                          className="p-1 text-gray-300 hover:text-blue-500 opacity-0 group-hover/resp:opacity-100 transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => removeResponsible(r.id, action.id, strat.id)} className="p-1 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                                                      </div>
                                                    )
                                                  })}
                                                  {isAssigning ? (
                                                    <div className="bg-white border border-indigo-200 rounded-lg p-2.5 space-y-2">
                                                      <div className="grid grid-cols-2 gap-2">
                                                        <select value={assignEmployeeId} onChange={e => setAssignEmployeeId(e.target.value)}
                                                          className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                                          <option value="">— Responsable —</option>
                                                          {faculty.map(f => <option key={f.id} value={f.id}>{f.full_name}</option>)}
                                                        </select>
                                                        <input value={assignForm.code} onChange={e => setAssignForm(p => ({ ...p, code: e.target.value }))}
                                                          placeholder="Código" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                                        <input value={assignForm.name} onChange={e => setAssignForm(p => ({ ...p, name: e.target.value }))}
                                                          placeholder="Descripción de la acción del responsable" className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                                        <input value={assignForm.years} onChange={e => setAssignForm(p => ({ ...p, years: e.target.value }))}
                                                          placeholder={`Años en que se ejecuta, ej. ${currentYear}, ${currentYear + 1}`} className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                                      </div>
                                                      <div className="flex gap-2">
                                                        <button onClick={() => assignResponsible(action.id, strat.id)} disabled={!assignEmployeeId || !assignForm.name || parseYears(assignForm.years).length === 0}
                                                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg"><Check className="w-3 h-3" /> Guardar</button>
                                                        <button onClick={() => { setAssigningAction(null); setAssignForm({ code: '', name: '', years: '' }) }}
                                                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-white">Cancelar</button>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <button onClick={() => { setAssigningAction(action.id); setAssignEmployeeId(''); setAssignForm({ code: '', name: '', years: '' }) }}
                                                      className="text-xs text-indigo-600 hover:text-indigo-700 px-1.5 py-1 border border-dashed border-indigo-200 rounded-full">+ Acción por responsable</button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}

                                        {showActionForm[strat.id] ? (
                                          <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                                            <div className="grid grid-cols-4 gap-2">
                                              <input value={actionForm[strat.id]?.code ?? ''} onChange={e => setActionForm(p => ({ ...p, [strat.id]: { ...(p[strat.id] ?? { code: '', name: '', start_year: '', target_close_year: '', valid_from_year: '' }), code: e.target.value } }))}
                                                placeholder="Código" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                              <input value={actionForm[strat.id]?.name ?? ''} onChange={e => setActionForm(p => ({ ...p, [strat.id]: { ...(p[strat.id] ?? { code: '', name: '', start_year: '', target_close_year: '', valid_from_year: '' }), name: e.target.value } }))}
                                                placeholder="Nombre de la acción" className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                              <input type="number" value={actionForm[strat.id]?.target_close_year ?? ''} onChange={e => setActionForm(p => ({ ...p, [strat.id]: { ...(p[strat.id] ?? { code: '', name: '', start_year: '', target_close_year: '', valid_from_year: '' }), target_close_year: e.target.value } }))}
                                                placeholder="Cierre" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                              <input type="number" value={actionForm[strat.id]?.valid_from_year ?? ''} onChange={e => setActionForm(p => ({ ...p, [strat.id]: { ...(p[strat.id] ?? { code: '', name: '', start_year: '', target_close_year: '', valid_from_year: '' }), valid_from_year: e.target.value } }))}
                                                placeholder={`Año de versión (ej. ${currentYear})`} className="col-span-4 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                            </div>
                                            <div className="flex gap-2">
                                              <button onClick={() => createAction(strat.id)} disabled={!actionForm[strat.id]?.name}
                                                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg">Crear acción</button>
                                              <button onClick={() => setShowActionForm(p => ({ ...p, [strat.id]: false }))} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button onClick={() => setShowActionForm(p => ({ ...p, [strat.id]: true }))}
                                            className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 py-1"><Plus className="w-3 h-3" /> Agregar acción</button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}

                              {showStratForm[obj.id] ? (
                                <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
                                  <div className="grid grid-cols-3 gap-2">
                                    <input value={stratForm[obj.id]?.code ?? ''} onChange={e => setStratForm(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? { code: '', name: '', valid_from_year: '' }), code: e.target.value } }))}
                                      placeholder="Código" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    <input value={stratForm[obj.id]?.name ?? ''} onChange={e => setStratForm(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? { code: '', name: '', valid_from_year: '' }), name: e.target.value } }))}
                                      placeholder="Nombre de la estrategia" className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    <input type="number" value={stratForm[obj.id]?.valid_from_year ?? ''} onChange={e => setStratForm(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? { code: '', name: '', valid_from_year: '' }), valid_from_year: e.target.value } }))}
                                      placeholder={`Año de versión (ej. ${currentYear})`} className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => createStrategy(obj.id)} disabled={!stratForm[obj.id]?.name}
                                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg">Crear estrategia</button>
                                    <button onClick={() => setShowStratForm(p => ({ ...p, [obj.id]: false }))} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setShowStratForm(p => ({ ...p, [obj.id]: true }))}
                                  className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 py-1"><Plus className="w-3 h-3" /> Agregar estrategia</button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {showObjForm[dim.id] ? (
                      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <input value={objForm[dim.id]?.code ?? ''} onChange={e => setObjForm(p => ({ ...p, [dim.id]: { ...(p[dim.id] ?? { code: '', name: '', valid_from_year: '' }), code: e.target.value } }))}
                            placeholder="Código" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <input value={objForm[dim.id]?.name ?? ''} onChange={e => setObjForm(p => ({ ...p, [dim.id]: { ...(p[dim.id] ?? { code: '', name: '', valid_from_year: '' }), name: e.target.value } }))}
                            placeholder="Nombre del objetivo" className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <input type="number" value={objForm[dim.id]?.valid_from_year ?? ''} onChange={e => setObjForm(p => ({ ...p, [dim.id]: { ...(p[dim.id] ?? { code: '', name: '', valid_from_year: '' }), valid_from_year: e.target.value } }))}
                            placeholder={`Año de versión (ej. ${currentYear})`} className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => createObjective(dim.id)} disabled={!objForm[dim.id]?.name}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg">Crear objetivo</button>
                          <button onClick={() => setShowObjForm(p => ({ ...p, [dim.id]: false }))} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowObjForm(p => ({ ...p, [dim.id]: true }))}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 py-1"><Plus className="w-3 h-3" /> Agregar objetivo</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {showDimForm ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input value={dimForm.code} onChange={e => setDimForm(p => ({ ...p, code: e.target.value }))}
                  placeholder="Código (Ej. E1)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={dimForm.name} onChange={e => setDimForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nombre de la dimensión" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={createDimension} disabled={!dimForm.code || !dimForm.name}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">Crear dimensión</button>
                <button onClick={() => setShowDimForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowDimForm(true)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 py-2"><Plus className="w-4 h-4" /> Agregar dimensión estratégica</button>
          )}
        </div>
      )}

      {/* Modal de revisión / nueva versión */}
      {revising && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRevising(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-gray-900">Nueva versión (revisión)</p>
            </div>
            <p className="text-xs text-gray-500">Se conservará la versión anterior en el historial. Esta entrada quedará vigente desde el año indicado.</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
              <input value={reviseForm.name} onChange={e => setReviseForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <textarea value={reviseForm.description} onChange={e => setReviseForm(p => ({ ...p, description: e.target.value }))} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Vigente desde (año)</label>
                <input type="number" value={reviseForm.valid_from_year} onChange={e => setReviseForm(p => ({ ...p, valid_from_year: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Motivo del cambio</label>
                <input value={reviseForm.change_reason} onChange={e => setReviseForm(p => ({ ...p, change_reason: e.target.value }))}
                  placeholder="Opcional" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveRevise} disabled={!reviseForm.name || savingRevise}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
                {savingRevise ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savingRevise ? 'Guardando...' : 'Guardar nueva versión'}
              </button>
              <button onClick={() => setRevising(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
