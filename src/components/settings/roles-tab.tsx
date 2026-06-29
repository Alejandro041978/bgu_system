'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

type Role = { id: string; name: string; label: string }

export function RolesTab({ roles: initial, onRolesChange }: { roles: Role[]; onRolesChange: (r: Role[]) => void }) {
  const [roles, setRoles] = useState(initial)
  const [form, setForm] = useState({ name: '', label: '' })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/settings/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json() as { id: string }
    const newRole = { ...form, id: data.id }
    const updated = [...roles, newRole]
    setRoles(updated)
    onRolesChange(updated)
    setForm({ name: '', label: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch('/api/settings/roles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const updated = roles.filter(r => r.id !== id)
    setRoles(updated)
    onRolesChange(updated)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(o => !o)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Nuevo rol
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Nuevo rol</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre interno (slug)</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="agente_servicio"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Etiqueta visible</label>
              <input
                required
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="Agente de servicio"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs border border-gray-700 rounded-lg hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
              {saving ? 'Guardando...' : 'Crear rol'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {roles.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-10">No hay roles definidos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Rol</th>
                <th className="text-left px-5 py-3">Nombre interno</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {roles.map(r => (
                <tr key={r.id} className="hover:bg-gray-800/30">
                  <td className="px-5 py-3.5 font-medium">{r.label}</td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{r.name}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
