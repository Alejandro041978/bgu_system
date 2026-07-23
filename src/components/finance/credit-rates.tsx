'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, BadgeDollarSign } from 'lucide-react'

interface Rate {
  id: string; category_id: string | null; program_id: string | null
  price_per_credit: number; currency: string; effective_from: string
  note: string | null; created_by: string | null; created_at: string
}
interface Cat { id: string; name: string; sigla: string | null }
interface Prog { id: string; name: string; category_id: string | null }

const money = (n: number) => `$${Number(n).toFixed(2)}`
const hoy = () => new Date().toISOString().slice(0, 10)

export function CreditRates() {
  const [rates, setRates] = useState<Rate[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [programs, setPrograms] = useState<Prog[]>([])
  const [creditsBy, setCreditsBy] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Nueva versión
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'category' | 'program'>('category')
  const [catId, setCatId] = useState('')
  const [progId, setProgId] = useState('')
  const [price, setPrice] = useState('')
  const [from, setFrom] = useState(hoy())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch('/api/finance/credit-rates').then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setRates(d.rates ?? []); setCategories(d.categories ?? []); setPrograms(d.programs ?? [])
    setCreditsBy(d.credits_by_program ?? {}); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function publish() {
    if (!Number(price) || (scope === 'category' ? !catId : !progId)) return
    setSaving(true); setError(null)
    const d = await fetch('/api/finance/credit-rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: scope === 'category' ? catId : null,
        program_id: scope === 'program' ? progId : null,
        price_per_credit: Number(price), effective_from: from, note: note.trim() || null,
      }),
    }).then(r => r.json())
    setSaving(false)
    if (d.error) { setError(d.error); return }
    setOpen(false); setPrice(''); setNote(''); setFrom(hoy())
    load()
  }

  async function removeFuture(id: string) {
    if (!confirm('¿Borrar esta versión aún NO vigente?')) return
    const d = await fetch(`/api/finance/credit-rates?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load()
  }

  // Tarifa vigente HOY por alcance (la más reciente no futura)
  const vigente = (pred: (r: Rate) => boolean): Rate | null =>
    rates.filter(r => pred(r) && r.effective_from <= hoy()).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null

  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? '—'
  const progName = (id: string | null) => programs.find(p => p.id === id)?.name ?? '—'
  const scopeLabel = (r: Rate) => r.program_id ? progName(r.program_id) : catName(r.category_id)

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Tarifas vigentes hoy */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Tarifas vigentes hoy</h3>
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5" />Publicar nueva versión
          </button>
        </div>

        {open && (
          <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/40 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
            <label className="block sm:col-span-2"><span className="block text-[11px] text-gray-500 mb-0.5">Alcance</span>
              <div className="flex gap-2">
                <select value={scope} onChange={e => setScope(e.target.value as 'category' | 'program')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                  <option value="category">Categoría</option>
                  <option value="program">Programa</option>
                </select>
                {scope === 'category' ? (
                  <select value={catId} onChange={e => setCatId(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                    <option value="">Seleccionar…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <select value={progId} onChange={e => setProgId(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                    <option value="">Seleccionar…</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            </label>
            <label className="block"><span className="block text-[11px] text-gray-500 mb-0.5">USD por crédito</span>
              <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" placeholder="Ej. 35" />
            </label>
            <label className="block"><span className="block text-[11px] text-gray-500 mb-0.5">Vigente desde</span>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            </label>
            <button onClick={publish} disabled={saving || !Number(price) || (scope === 'category' ? !catId : !progId)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeDollarSign className="w-3.5 h-3.5" />}Publicar
            </button>
            <label className="block sm:col-span-5"><span className="block text-[11px] text-gray-500 mb-0.5">Nota (resolución, referencia de publicación…)</span>
              <input value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" placeholder="Opcional" />
            </label>
            <p className="sm:col-span-5 text-[11px] text-gray-400">Los precios publicados no se editan ni se borran: cada cambio es una versión nueva que rige desde su fecha de vigencia.</p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="px-4 py-2 text-left">Categoría</th>
              <th className="px-4 py-2 text-right">USD / crédito</th>
              <th className="px-4 py-2 text-left">Vigente desde</th>
              <th className="px-4 py-2 text-left">Excepciones por programa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map(c => {
              const v = vigente(r => r.category_id === c.id)
              const excepciones = programs.filter(p => p.category_id === c.id && vigente(r => r.program_id === p.id))
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{v ? money(v.price_per_credit) : <span className="text-amber-600 text-xs">sin tarifa</span>}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{v?.effective_from ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {excepciones.length === 0 ? '—' : excepciones.map(p => {
                      const pv = vigente(r => r.program_id === p.id)!
                      return <span key={p.id} className="inline-block bg-purple-50 text-purple-700 rounded-full px-2 py-0.5 mr-1 mb-0.5">{p.name}: {money(pv.price_per_credit)}{creditsBy[p.id] ? ` · lista ${money(pv.price_per_credit * creditsBy[p.id])}` : ''}</span>
                    })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Historial completo (evidencia regulatoria) */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-800">Historial de versiones</h3></div>
        {rates.length === 0 ? <p className="px-4 py-8 text-center text-xs text-gray-400">Aún no hay tarifas publicadas.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Alcance</th>
                <th className="px-4 py-2 text-right">USD / crédito</th>
                <th className="px-4 py-2 text-left">Vigente desde</th>
                <th className="px-4 py-2 text-left">Nota</th>
                <th className="px-4 py-2 text-left">Publicada por</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rates.map(r => (
                <tr key={r.id} className={r.effective_from > hoy() ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-2 text-gray-800">{scopeLabel(r)}{r.program_id && <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">programa</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.price_per_credit)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.effective_from}{r.effective_from > hoy() && <span className="ml-1 text-amber-600">(futura)</span>}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.note ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{r.created_by ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {r.effective_from > hoy() && (
                      <button onClick={() => removeFuture(r.id)} className="text-gray-300 hover:text-red-600" title="Borrar (aún no vigente)"><Trash2 className="w-4 h-4" /></button>
                    )}
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
