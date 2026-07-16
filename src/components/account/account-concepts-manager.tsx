'use client'

import { useEffect, useState, useCallback } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'

interface Concept { kind: string; type_code: number; n: number; abbr: string | null; name: string | null }

export function AccountConceptsManager() {
  const [rows, setRows] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/account/concepts').then(r => r.json())
    setRows(d.concepts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function edit(key: string, field: 'abbr' | 'name', value: string) {
    setRows(prev => prev.map(r => (`${r.kind}:${r.type_code}` === key ? { ...r, [field]: value } : r)))
    setSavedKey(null)
  }

  async function save(r: Concept) {
    const key = `${r.kind}:${r.type_code}`
    setSavingKey(key)
    await fetch('/api/account/concepts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: r.kind, type_code: r.type_code, abbr: r.abbr, name: r.name }),
    })
    setSavingKey(null); setSavedKey(key)
    setTimeout(() => setSavedKey(k => (k === key ? null : k)), 1500)
  }

  // Alta de un concepto nuevo (código propio asignado por el servidor)
  const [newAbbr, setNewAbbr] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  async function create() {
    if (!newName.trim() && !newAbbr.trim()) return
    setCreating(true)
    const res = await fetch('/api/account/concepts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ create: true, kind: 'charge', abbr: newAbbr, name: newName }),
    })
    setCreating(false)
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'No se pudo crear'); return }
    setNewAbbr(''); setNewName(''); load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  const groups: { kind: string; label: string }[] = [
    { kind: 'charge', label: 'Cuotas (Installment.Type)' },
    { kind: 'payment', label: 'Pagos (Payment.Type)' },
  ]

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Define la <b>abreviatura</b> (columna Concepto) y el <b>nombre completo</b> (tooltip) de cada tipo.
        La columna <b>#</b> indica cuántos registros usan ese tipo.
      </p>

      {/* Alta de concepto nuevo (para cargos que genera el ERP, ej. documentos) */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-blue-800 mb-2">Nuevo concepto de cargo</p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Abreviatura</label>
            <input value={newAbbr} onChange={e => setNewAbbr(e.target.value)} maxLength={8} placeholder="Ej. StudCard"
              className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-600 mb-1">Nombre completo</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. International Student Card"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={create} disabled={creating || (!newName.trim() && !newAbbr.trim())}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Se le asigna un código propio (≥1000) y queda disponible de inmediato en el desplegable de tipos de documento.</p>
      </div>
      {groups.map(g => {
        const list = rows.filter(r => r.kind === g.kind)
        if (list.length === 0) return null
        return (
          <div key={g.kind}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{g.label}</h3>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 w-16">Type</th>
                    <th className="text-right px-4 py-2.5 w-20">#</th>
                    <th className="text-left px-4 py-2.5 w-32">Abreviatura</th>
                    <th className="text-left px-4 py-2.5">Nombre completo</th>
                    <th className="px-4 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => {
                    const key = `${r.kind}:${r.type_code}`
                    return (
                      <tr key={key} className="border-t border-gray-50">
                        <td className="px-4 py-2 text-gray-700 font-medium">{r.type_code}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{r.n.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <input value={r.abbr ?? ''} onChange={e => edit(key, 'abbr', e.target.value)}
                            placeholder={`T${r.type_code}`} maxLength={8}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-2">
                          <input value={r.name ?? ''} onChange={e => edit(key, 'name', e.target.value)}
                            placeholder="Nombre completo del concepto"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => save(r)} disabled={savingKey === key}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors">
                            {savingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : savedKey === key ? <Check className="w-3.5 h-3.5" /> : null}
                            {savedKey === key ? 'Guardado' : 'Guardar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
