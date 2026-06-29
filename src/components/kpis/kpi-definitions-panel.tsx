'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

type Period = { id: string; name: string; start_date: string; end_date: string }
type Employee = { id: string; full_name: string; position: string | null; email: string }

type KpiDef = {
  id: string
  employee_id: string
  name: string
  metric_type: string
  target_value: number
  unit: string | null
  comparison: string
  sort_order: number
}

const METRIC_TYPES = [
  { value: 'zoho_tickets_resolved', label: 'Tickets resueltos (Zoho Desk)', unit: 'tickets', comparison: 'gte' },
  { value: 'zoho_resolution_time', label: 'Tiempo de resolución (Zoho Desk)', unit: 'hrs', comparison: 'lte' },
  { value: 'zoho_satisfaction', label: 'Satisfacción CSAT — % GOOD (Zoho Desk)', unit: '%', comparison: 'gte' },
  { value: 'manual', label: 'KPI manual (ingreso manual)', unit: '', comparison: 'gte' },
]

export function KpiDefinitionsPanel({ period, employees }: { period: Period; employees: Employee[] }) {
  const [defs, setDefs] = useState<KpiDef[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<string>(employees[0]?.id ?? '')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    metric_type: 'zoho_tickets_resolved',
    target_value: '',
    unit: 'tickets',
    comparison: 'gte',
  })
  const [saving, setSaving] = useState(false)

  const loadDefs = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/kpis/definitions?period_id=${period.id}&employee_id=${selectedEmployee}`)
    const data = await res.json() as KpiDef[]
    setDefs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [period.id, selectedEmployee])

  useEffect(() => { if (selectedEmployee) loadDefs() }, [loadDefs, selectedEmployee])

  function onMetricChange(value: string) {
    const mt = METRIC_TYPES.find(m => m.value === value)
    setForm(prev => ({
      ...prev,
      metric_type: value,
      unit: mt?.unit ?? '',
      comparison: mt?.comparison ?? 'gte',
      name: prev.name || (mt ? mt.label.split('(')[0].trim() : ''),
    }))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/kpis/definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period_id: period.id,
        employee_id: selectedEmployee,
        name: form.name,
        metric_type: form.metric_type,
        target_value: parseFloat(form.target_value),
        unit: form.unit || null,
        comparison: form.comparison,
        sort_order: defs.length,
      }),
    })
    setShowForm(false)
    setForm({ name: '', metric_type: 'zoho_tickets_resolved', target_value: '', unit: 'tickets', comparison: 'gte' })
    await loadDefs()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch('/api/kpis/definitions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDefs(prev => prev.filter(d => d.id !== id))
  }

  const emp = employees.find(e => e.id === selectedEmployee)

  return (
    <div className="space-y-4">
      {/* Selector de colaborador */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-xs font-medium text-gray-700 mb-2">Colaborador</label>
        <select
          value={selectedEmployee}
          onChange={e => setSelectedEmployee(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {employees.map(e => (
            <option key={e.id} value={e.id}>
              {e.full_name}{e.position ? ` · ${e.position}` : ''}
            </option>
          ))}
        </select>
        {emp && (
          <p className="text-xs text-gray-400 mt-1">
            Email usado para consultas Zoho: <span className="text-gray-600">{emp.email}</span>
          </p>
        )}
      </div>

      {/* Lista de KPIs del empleado */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            KPIs configurados ({defs.length})
          </h3>
          <button
            onClick={() => setShowForm(o => !o)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar KPI
            {showForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAdd} className="px-5 py-4 bg-blue-50/50 border-b border-gray-100 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de métrica *</label>
                <select
                  value={form.metric_type}
                  onChange={e => onMetricChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {METRIC_TYPES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del KPI *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej. Tickets resueltos"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Valor objetivo *</label>
                <div className="flex gap-2">
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.target_value}
                    onChange={e => setForm(prev => ({ ...prev, target_value: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="50"
                  />
                  <input
                    value={form.unit}
                    onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="tickets"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Condición</label>
                <select
                  value={form.comparison}
                  onChange={e => setForm(prev => ({ ...prev, comparison: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="gte">Mayor o igual (≥ mínimo)</option>
                  <option value="lte">Menor o igual (≤ máximo)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar KPI'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Cargando...</div>
        ) : defs.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Sin KPIs configurados. Usa el botón &quot;Agregar KPI&quot; para crear el primero.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {defs.map(d => (
              <div key={d.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{d.name}</p>
                  <p className="text-xs text-gray-500">
                    {d.comparison === 'gte' ? '≥' : '≤'} {d.target_value} {d.unit ?? ''} ·{' '}
                    <span className="text-gray-400">{METRIC_TYPES.find(m => m.value === d.metric_type)?.label ?? d.metric_type}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
