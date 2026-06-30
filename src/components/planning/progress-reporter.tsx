'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2 } from 'lucide-react'
import { ACTION_STATUS } from './status'

type Employee = { id: string; full_name: string; position: string | null }
type Crumb = { id: string; code?: string; name?: string } | null
type ResponsibleItem = {
  id: string; code: string | null; name: string | null; assigned_from_year: number; employee: Employee
  action: Crumb; strategy: Crumb; objective: Crumb; dimension: Crumb
}
type ProgressEntry = {
  id: string; year: number; status: string; progress_pct: number | null; notes: string | null
  reported_at: string; reported_by: { id: string; full_name: string } | null
}
type Cycle = { id: string; name: string; start_year: number; end_year: number }

export function ProgressReporter({ cycles, employees }: { cycles: Cycle[]; employees: Employee[] }) {
  const [selectedCycleId, setSelectedCycleId] = useState(cycles[0]?.id ?? '')
  const [items, setItems] = useState<ResponsibleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filterEmployeeId, setFilterEmployeeId] = useState('')

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [progressByResp, setProgressByResp] = useState<Record<string, ProgressEntry[]>>({})

  const [showForm, setShowForm] = useState<string | null>(null)
  const [form, setForm] = useState({ year: String(new Date().getFullYear()), status: 'active', progress_pct: '0', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!selectedCycleId) return
    setLoading(true)
    fetch(`/api/planning/responsibles/tree?cycle_id=${selectedCycleId}`)
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
  }, [selectedCycleId])

  async function loadProgress(respId: string) {
    const res = await fetch(`/api/planning/progress?responsible_id=${respId}`)
    const data = await res.json()
    setProgressByResp(prev => ({ ...prev, [respId]: Array.isArray(data) ? data : [] }))
  }

  function toggle(respId: string) {
    const next = !(expanded[respId] ?? false)
    setExpanded(prev => ({ ...prev, [respId]: next }))
    if (next && !progressByResp[respId]) loadProgress(respId)
  }

  async function addProgress(respId: string) {
    setSaving(true)
    const res = await fetch('/api/planning/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responsible_id: respId, year: Number(form.year), status: form.status, progress_pct: Number(form.progress_pct), notes: form.notes || null,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setProgressByResp(prev => ({ ...prev, [respId]: [data, ...(prev[respId] ?? [])] }))
      setForm({ year: String(new Date().getFullYear()), status: 'active', progress_pct: '0', notes: '' })
      setShowForm(null)
    }
    setSaving(false)
  }

  async function deleteProgress(id: string, respId: string) {
    if (!confirm('¿Eliminar este reporte de avance?')) return
    await fetch(`/api/planning/progress/${id}`, { method: 'DELETE' })
    setProgressByResp(prev => ({ ...prev, [respId]: (prev[respId] ?? []).filter(p => p.id !== id) }))
  }

  const filtered = filterEmployeeId ? items.filter(i => i.employee?.id === filterEmployeeId) : items

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Reportar Avances</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cada responsable registra el avance de sus acciones, año por año</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <select value={selectedCycleId} onChange={e => setSelectedCycleId(e.target.value)}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={filterEmployeeId} onChange={e => setFilterEmployeeId(e.target.value)}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los responsables</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          No hay acciones por responsable registradas en este ciclo.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const isOpen = expanded[item.id] ?? false
            const entries = progressByResp[item.id] ?? []
            const latest = entries[0]
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggle(item.id)}>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {item.code && <span className="text-gray-400 mr-1.5">{item.code}</span>}{item.name ?? 'Sin descripción'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {item.dimension?.code} › {item.objective?.code} › {item.strategy?.code} › {item.action?.code} · {item.employee?.full_name}
                    </p>
                  </div>
                  {latest && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${ACTION_STATUS[latest.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                      {latest.year}: {latest.progress_pct ?? 0}%
                    </span>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                    {entries.length === 0 && <p className="text-xs text-gray-400">Sin reportes de avance todavía.</p>}
                    {entries.map(p => (
                      <div key={p.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2">
                        <span className="text-sm font-semibold text-gray-700 w-14">{p.year}</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ACTION_STATUS[p.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                          {ACTION_STATUS[p.status]?.label ?? p.status}
                        </span>
                        <span className="text-xs text-gray-500">{p.progress_pct ?? 0}%</span>
                        {p.notes && <span className="flex-1 text-xs text-gray-400 truncate">{p.notes}</span>}
                        {p.reported_by && <span className="text-xs text-gray-300">· {p.reported_by.full_name}</span>}
                        <button onClick={() => deleteProgress(p.id, item.id)} className="ml-auto p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}

                    {showForm === item.id ? (
                      <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                          <input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))}
                            placeholder="Año" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            {Object.entries(ACTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <input type="number" min="0" max="100" value={form.progress_pct} onChange={e => setForm(p => ({ ...p, progress_pct: e.target.value }))}
                            placeholder="%" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Notas (opcional)" className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => addProgress(item.id)} disabled={!form.year || saving}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg">
                            {saving ? 'Guardando...' : 'Guardar reporte'}
                          </button>
                          <button onClick={() => setShowForm(null)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-white">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowForm(item.id)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"><Plus className="w-3.5 h-3.5" /> Reportar avance de un año</button>
                    )}
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
