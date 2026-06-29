'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, ArrowLeft, Pencil, X, Save } from 'lucide-react'
import Link from 'next/link'
import { KpiDefinitionsPanel } from './kpi-definitions-panel'

type Period = {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'active' | 'closed' | 'draft'
}

type Employee = {
  id: string
  full_name: string
  position: string | null
  email: string
}

const STATUS_LABEL: Record<string, string> = { active: 'Activo', closed: 'Cerrado', draft: 'Borrador' }
const STATUS_COLOR: Record<string, string> = {
  active: 'text-green-400 bg-green-900/30 border-green-800',
  closed: 'text-gray-400 bg-gray-800 border-gray-700',
  draft: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
}

export function KpiPeriodsManager({ periods: initial, employees }: { periods: Period[]; employees: Employee[] }) {
  const router = useRouter()
  const [periods, setPeriods] = useState(initial)
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', start_date: '', end_date: '', status: 'active' })
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', status: 'active' })

  function setF(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function startEdit(p: Period, ev: React.MouseEvent) {
    ev.stopPropagation()
    setEditingId(p.id)
    setEditForm({ name: p.name, start_date: p.start_date, end_date: p.end_date, status: p.status })
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/kpis/periods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...editForm }),
    })
    setPeriods(prev => prev.map(p => p.id === editingId ? { ...p, ...editForm, status: editForm.status as Period['status'] } : p))
    setEditingId(null)
    setSaving(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/kpis/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json() as { id: string }
    const newPeriod: Period = { ...form, id: data.id, status: form.status as Period['status'] }
    setPeriods(prev => [newPeriod, ...prev])
    setForm({ name: '', start_date: '', end_date: '', status: 'active' })
    setShowNewForm(false)
    setSaving(false)
    router.refresh()
  }

  if (selectedPeriod) {
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedPeriod(null)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-bold text-gray-900">{selectedPeriod.name}</h2>
            <p className="text-xs text-gray-500">
              {new Date(selectedPeriod.start_date).toLocaleDateString('es-PE')} —{' '}
              {new Date(selectedPeriod.end_date).toLocaleDateString('es-PE')}
            </p>
          </div>
        </div>
        <KpiDefinitionsPanel period={selectedPeriod} employees={employees} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/kpis" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-base font-bold text-gray-900">Meses Calidad</h1>
        </div>
        <button
          onClick={() => setShowNewForm(o => !o)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo período
        </button>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Nuevo mes calidad</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                required
                value={form.name}
                onChange={e => setF('name', e.target.value)}
                placeholder="Ej. Calidad Junio 26"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio *</label>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={e => setF('start_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha fin *</label>
              <input
                required
                type="date"
                value={form.end_date}
                onChange={e => setF('end_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-700">Estado:</label>
            {['active', 'draft', 'closed'].map(s => (
              <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={form.status === s}
                  onChange={() => setF('status', s)}
                />
                {STATUS_LABEL[s]}
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {saving ? 'Guardando...' : 'Crear período'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {periods.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            No hay períodos creados aún.
          </div>
        ) : (
          periods.map(p => editingId === p.id ? (
            <form key={p.id} onSubmit={handleUpdate} className="bg-white rounded-xl border border-blue-300 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Editar período</h3>
                <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                  <input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio *</label>
                  <input required type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha fin *</label>
                  <input required type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-700">Estado:</label>
                {['active', 'draft', 'closed'].map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="edit_status" value={s} checked={editForm.status === s}
                      onChange={() => setEditForm(f => ({ ...f, status: s }))} />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditingId(null)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  <Save className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          ) : (
            <div
              key={p.id}
              onClick={() => setSelectedPeriod(p)}
              className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(p.start_date).toLocaleDateString('es-PE')} — {new Date(p.end_date).toLocaleDateString('es-PE')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={ev => startEdit(p, ev)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
                <div className="flex items-center gap-1 text-gray-400">
                  <span className="text-xs">Configurar KPIs</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
