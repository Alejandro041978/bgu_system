'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Layers, ChevronDown, ChevronRight } from 'lucide-react'

interface Cat { id: string; name: string; sigla: string | null; passing_score: number | null; programs: number; convocatorias: number }

export function CategoriesManager() {
  const [open, setOpen] = useState(false)
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [newName, setNewName] = useState('')
  const [newSigla, setNewSigla] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSigla, setEditSigla] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/academic/program-categories').then(r => r.json())
    if (!d.error) setCats(d.categories ?? [])
  }, [])

  useEffect(() => { if (open && cats === null) load() }, [open, cats, load])

  async function create() {
    if (!newName.trim()) return
    setCreating(true); setError(null)
    const res = await fetch('/api/academic/program-categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, sigla: newSigla }),
    })
    const d = await res.json()
    setCreating(false)
    if (d.error) { setError(d.error); return }
    setNewName(''); setNewSigla('')
    load()
  }

  async function rename(id: string) {
    if (!editName.trim()) return
    setBusy(id); setError(null)
    const res = await fetch(`/api/academic/program-categories/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName, sigla: editSigla }),
    })
    const d = await res.json()
    setBusy(null)
    if (d.error) { setError(d.error); return }
    setEditing(null)
    load()
  }

  async function remove(c: Cat) {
    if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return
    setBusy(c.id); setError(null)
    const res = await fetch(`/api/academic/program-categories/${c.id}`, { method: 'DELETE' })
    const d = await res.json()
    setBusy(null)
    if (d.error) { setError(d.error); return }
    load()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Layers className="w-4 h-4 text-gray-400" /> Categorías de programas
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {error && <p className="text-sm bg-red-50 text-red-600 px-3 py-2 rounded-lg">{error}</p>}

          {cats === null ? (
            <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cats.map(c => (
                <div key={c.id} className="flex items-center gap-2 py-2">
                  {editing === c.id ? (
                    <>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') rename(c.id); if (e.key === 'Escape') setEditing(null) }}
                        className="flex-1 border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                      <input value={editSigla} onChange={e => setEditSigla(e.target.value.toUpperCase())} maxLength={5}
                        onKeyDown={e => { if (e.key === 'Enter') rename(c.id); if (e.key === 'Escape') setEditing(null) }}
                        placeholder="Sigla"
                        className="w-20 border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={() => rename(c.id)} disabled={busy === c.id} className="text-green-600 hover:text-green-800" title="Guardar">
                        {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600" title="Cancelar"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">
                        {c.name}
                        {c.sigla && <span className="ml-2 bg-blue-50 text-blue-700 text-[11px] font-mono px-1.5 py-0.5 rounded">{c.sigla}</span>}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {c.programs} programa{c.programs === 1 ? '' : 's'} · {c.convocatorias} convocatoria{c.convocatorias === 1 ? '' : 's'}
                        {c.passing_score != null && ` · aprueba con ${c.passing_score}`}
                      </span>
                      <button onClick={() => { setEditing(c.id); setEditName(c.name); setEditSigla(c.sigla ?? '') }} className="text-gray-300 hover:text-blue-600" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(c)} disabled={busy === c.id || c.programs > 0 || c.convocatorias > 0}
                        className="text-gray-300 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-300"
                        title={c.programs > 0 || c.convocatorias > 0 ? 'Tiene programas o convocatorias asociados' : 'Eliminar'}>
                        {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {cats.length === 0 && <p className="text-sm text-gray-400 py-3">Sin categorías.</p>}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="Nueva categoría…"
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={newSigla} onChange={e => setNewSigla(e.target.value.toUpperCase())} maxLength={5}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="Sigla"
              className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={create} disabled={creating || !newName.trim()}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded-lg">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
