'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, X, Save, Loader2, Filter } from 'lucide-react'

interface Bot { key: string; name: string }
interface Category { id: string; name: string }
interface Program { id: string; name: string; category_id: string | null }
interface Funnel {
  id: string; bot_key: string; name: string
  scope_category_id: string | null; scope_program_ids: string[]; active: boolean; sort_order: number
}

const blank = () => ({
  id: '', bot_key: '', name: '',
  scope_mode: 'category' as 'category' | 'programs',
  scope_category_id: '', scope_program_ids: [] as string[], active: true,
})

export function FunnelsConfig() {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank())
  const [progFilter, setProgFilter] = useState('')

  const load = useCallback(async () => {
    const d = await fetch('/api/sales/funnels').then(r => r.json())
    setFunnels(d.funnels ?? []); setBots(d.bots ?? []); setCategories(d.categories ?? []); setPrograms(d.programs ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  function newFunnel(botKey?: string) { setForm({ ...blank(), bot_key: botKey ?? bots[0]?.key ?? '' }); setEditing(true) }
  function editFunnel(f: Funnel) {
    setForm({
      id: f.id, bot_key: f.bot_key, name: f.name,
      scope_mode: (f.scope_program_ids ?? []).length > 0 ? 'programs' : 'category',
      scope_category_id: f.scope_category_id ?? '', scope_program_ids: f.scope_program_ids ?? [], active: f.active,
    })
    setEditing(true)
  }

  async function save() {
    if (!form.bot_key || !form.name.trim()) return
    setSaving(true)
    const body = {
      id: form.id || undefined, bot_key: form.bot_key, name: form.name, active: form.active,
      scope_category_id: form.scope_mode === 'category' ? (form.scope_category_id || null) : null,
      scope_program_ids: form.scope_mode === 'programs' ? form.scope_program_ids : [],
    }
    await fetch('/api/sales/funnels', {
      method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false); setEditing(false); load()
  }
  async function del(id: string) {
    if (!confirm('¿Eliminar este embudo? Los prospectos quedarán sin embudo asignado.')) return
    await fetch(`/api/sales/funnels?id=${id}`, { method: 'DELETE' }); load()
  }

  const botName = (k: string) => bots.find(b => b.key === k)?.name ?? k
  const catName = (id: string | null) => id ? (categories.find(c => c.id === id)?.name ?? '—') : null

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  if (editing) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{form.id ? 'Editar embudo' : 'Nuevo embudo'}</h3>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label><span className="block text-xs text-gray-500 mb-1">Bot de ventas</span>
            <select value={form.bot_key} onChange={e => setF('bot_key', e.target.value)} className={inp}>
              <option value="">Seleccionar…</option>
              {bots.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
          </label>
          <label><span className="block text-xs text-gray-500 mb-1">Nombre del embudo</span>
            <input value={form.name} onChange={e => setF('name', e.target.value)} className={inp} placeholder="Ej. Bachelor" />
          </label>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600">Qué vende este embudo</label>
          <select value={form.scope_mode} onChange={e => setF('scope_mode', e.target.value)} className={`${inp} sm:w-72 mt-1`}>
            <option value="category">Una categoría de productos</option>
            <option value="programs">Productos específicos</option>
          </select>

          {form.scope_mode === 'category' && (
            <select value={form.scope_category_id} onChange={e => setF('scope_category_id', e.target.value)} className={`${inp} sm:w-72 mt-2`}>
              <option value="">Seleccionar categoría…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {form.scope_mode === 'programs' && (
            <div className="mt-2 space-y-2">
              <input value={progFilter} onChange={e => setProgFilter(e.target.value)} className={`${inp} sm:w-72`} placeholder="Filtrar programas…" />
              <div className="border border-gray-200 rounded-lg max-h-52 overflow-auto divide-y divide-gray-50">
                {programs.filter(p => p.name.toLowerCase().includes(progFilter.toLowerCase())).map(p => {
                  const checked = form.scope_program_ids.includes(p.id)
                  return (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={checked} className="accent-blue-600"
                        onChange={() => setF('scope_program_ids', checked ? form.scope_program_ids.filter(x => x !== p.id) : [...form.scope_program_ids, p.id])} />
                      {p.name}
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">{form.scope_program_ids.length} producto(s) seleccionado(s).</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving || !form.bot_key || !form.name.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button>
          <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={form.active} onChange={e => setF('active', e.target.checked)} className="accent-blue-600" />Activo</label>
        </div>
      </div>
    )
  }

  // Agrupar por bot
  const byBot = bots.map(b => ({ bot: b, list: funnels.filter(f => f.bot_key === b.key).sort((a, c) => a.sort_order - c.sort_order) }))

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => newFunnel()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" />Nuevo embudo</button>
      </div>

      {byBot.map(({ bot, list }) => (
        <div key={bot.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{bot.name} <span className="text-gray-400 font-normal">· {list.length} embudo(s)</span></h3>
            <button onClick={() => newFunnel(bot.key)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Agregar a {bot.name}</button>
          </div>
          {list.length === 0 ? <p className="text-xs text-gray-400">Sin embudos.</p> : (
            <div className="grid gap-2">
              {list.map(f => (
                <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{f.name}{!f.active && <span className="ml-2 text-[11px] text-gray-400">(inactivo)</span>}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                      <Filter className="w-3.5 h-3.5 text-gray-300" />
                      {(f.scope_program_ids ?? []).length > 0
                        ? `${f.scope_program_ids.length} producto(s) específico(s)`
                        : (catName(f.scope_category_id) ?? <span className="text-amber-600">Sin categoría asignada</span>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => editFunnel(f)} className="text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(f.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
