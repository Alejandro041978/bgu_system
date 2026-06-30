'use client'

import { useState } from 'react'
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react'

type Role = { id: string; name: string; label: string }
type EmployeeRef = { role_id: string | null }

export function RolesTab({ roles: initial, onRolesChange, employees }: { roles: Role[]; onRolesChange: (r: Role[]) => void; employees: EmployeeRef[] }) {
  const [roles, setRoles] = useState(initial)
  const [form, setForm] = useState({ name: '', label: '' })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', label: '' })
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const usageCount = (roleId: string) => employees.filter(e => e.role_id === roleId).length

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

  function startEdit(r: Role) {
    setEditingId(r.id)
    setEditForm({ name: r.name, label: r.label })
    setDeleteError(null)
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    await fetch('/api/settings/roles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    const updated = roles.map(r => r.id === id ? { ...r, ...editForm } : r)
    setRoles(updated)
    onRolesChange(updated)
    setEditingId(null)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (usageCount(id) > 0) return
    setDeleteError(null)
    const res = await fetch('/api/settings/roles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setDeleteError(data.error ?? 'No se pudo eliminar el rol')
      return
    }
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

      {deleteError && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-2.5 flex items-center justify-between">
          {deleteError}
          <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-red-200"><X className="w-3.5 h-3.5" /></button>
        </div>
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
                <th className="text-left px-5 py-3">Usuarios</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {roles.map(r => {
                const count = usageCount(r.id)
                const isEditing = editingId === r.id
                return (
                  <tr key={r.id} className="hover:bg-gray-800/30">
                    {isEditing ? (
                      <>
                        <td className="px-5 py-2.5">
                          <input
                            value={editForm.label}
                            onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-5 py-2.5">
                          <input
                            value={editForm.name}
                            onChange={e => setEditForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">{count}</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(r.id)}
                              disabled={saving}
                              className="p-1.5 rounded-lg hover:bg-green-900/30 text-gray-500 hover:text-green-400 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-3.5 font-medium">{r.label}</td>
                        <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{r.name}</td>
                        <td className="px-5 py-3.5 text-gray-500">{count}</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => startEdit(r)}
                              className="p-1.5 rounded-lg hover:bg-blue-900/30 text-gray-500 hover:text-blue-400 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={count > 0}
                              title={count > 0 ? 'No se puede eliminar: tiene colaboradores asignados' : undefined}
                              className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
