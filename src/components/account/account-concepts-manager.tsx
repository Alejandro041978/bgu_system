'use client'

import { useEffect, useState, useCallback } from 'react'
import { Check, Loader2 } from 'lucide-react'

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
