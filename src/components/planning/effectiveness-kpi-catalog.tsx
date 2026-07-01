'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface KPI {
  id: string
  code: string
  level: string
  name: string
  formula?: string
  scope?: string
  frequency: string
  value_type: string
  created_at: string
}

const LEVELS = [
  { value: 'institucional', label: 'Institucional' },
  { value: 'estrategico', label: 'Estratégico' },
  { value: 'operativo', label: 'Operativo' },
]
const FREQUENCIES = [
  { value: 'anual', label: 'Anual' },
  { value: 'semestral', label: 'Semestral' },
]
const VALUE_TYPES = [
  { value: 'porcentaje', label: 'Porcentaje (%)' },
  { value: 'entero', label: 'Entero' },
  { value: 'decimal', label: 'Decimal' },
]

const LEVEL_COLORS: Record<string, string> = {
  institucional: 'bg-purple-100 text-purple-700',
  estrategico: 'bg-blue-100 text-blue-700',
  operativo: 'bg-green-100 text-green-700',
}

const emptyForm = { code: '', level: 'institucional', name: '', formula: '', scope: '', frequency: 'anual', value_type: 'porcentaje' }

export function EffectivenessKPICatalog() {
  const [kpis, setKpis] = useState<KPI[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/planning/effectiveness/kpis')
      .then(r => r.json())
      .then((d: KPI[]) => { setKpis(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/planning/effectiveness/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as KPI & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setKpis(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)))
      setShowForm(false)
      setForm({ ...emptyForm })
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar el KPI "${name}"? Si está vinculado a un plan no podrá eliminarse.`)) return
    const res = await fetch('/api/planning/effectiveness/kpis', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setKpis(prev => prev.filter(k => k.id !== id))
    else {
      const d = await res.json() as { error?: string }
      alert(d.error ?? 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Catálogo de KPIs</h2>
          <p className="text-sm text-gray-500">Define los indicadores que se usarán en los planes de efectividad</p>
        </div>
        <button
          onClick={() => setShowForm(o => !o)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo KPI
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Nuevo indicador</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Código *</label>
              <input required value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="KPI-01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nivel *</label>
              <select value={form.level}
                onChange={e => setForm(p => ({ ...p, level: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de valor *</label>
              <select value={form.value_type}
                onChange={e => setForm(p => ({ ...p, value_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {VALUE_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Denominación KPI *</label>
              <input required value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Tasa de graduación oportuna" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frecuencia *</label>
              <select value={form.frequency}
                onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Alcance</label>
              <textarea rows={2} value={form.scope}
                onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Descripción del alcance y propósito de este KPI" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Fórmula</label>
              <input value={form.formula}
                onChange={e => setForm(p => ({ ...p, formula: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. (Graduados en tiempo / Total inscritos) × 100" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button"
              onClick={() => { setShowForm(false); setForm({ ...emptyForm }); setError(null) }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : 'Guardar KPI'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : kpis.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No hay KPIs en el catálogo. Crea el primero.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Código</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Nivel</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Denominación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Alcance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Fórmula</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Frecuencia</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kpis.map(kpi => (
                <tr key={kpi.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{kpi.code}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[kpi.level] ?? 'bg-gray-100 text-gray-600'}`}>
                      {LEVELS.find(l => l.value === kpi.level)?.label ?? kpi.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">{kpi.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{kpi.scope ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{kpi.formula ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {VALUE_TYPES.find(v => v.value === kpi.value_type)?.label ?? kpi.value_type}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {FREQUENCIES.find(f => f.value === kpi.frequency)?.label ?? kpi.frequency}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(kpi.id, kpi.name)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
