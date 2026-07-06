'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2, Check, Save, Calculator } from 'lucide-react'
import { convertGrade } from '@/lib/grade-convert'

interface Scale {
  id: string; name: string; country: string | null
  origin_min: number; origin_max: number; origin_passing: number; active: boolean
}
interface Category { id: string; name: string; passing_score: number | null }

export function GradeScalesManager() {
  const [scales, setScales] = useState<Scale[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedCat, setSavedCat] = useState<string | null>(null)

  // form nueva escala
  const [form, setForm] = useState({ name: '', country: '', origin_min: '', origin_max: '', origin_passing: '' })

  // previsualización
  const [prevScale, setPrevScale] = useState('')
  const [prevCat, setPrevCat] = useState('')
  const [prevGrade, setPrevGrade] = useState('')

  async function load() {
    const d = await fetch('/api/academic/grade-scales').then(r => r.json())
    setScales(d.scales ?? []); setCategories(d.categories ?? []); setLoading(false)
  }
  useEffect(() => {
    fetch('/api/academic/grade-scales').then(r => r.json()).then(d => {
      setScales(d.scales ?? []); setCategories(d.categories ?? []); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function addScale() {
    if (!form.name || !form.origin_min || !form.origin_max || !form.origin_passing) return
    setSaving(true)
    const res = await fetch('/api/academic/grade-scales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, country: form.country || null,
        origin_min: Number(form.origin_min), origin_max: Number(form.origin_max), origin_passing: Number(form.origin_passing),
      }),
    })
    setSaving(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? 'Error'); return }
    setForm({ name: '', country: '', origin_min: '', origin_max: '', origin_passing: '' })
    await load()
  }
  async function delScale(id: string) {
    if (!confirm('¿Eliminar esta escala?')) return
    await fetch(`/api/academic/grade-scales/${id}`, { method: 'DELETE' })
    await load()
  }
  async function saveCategory(c: Category, value: string) {
    setSavedCat(null)
    await fetch(`/api/academic/program-categories/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passing_score: value === '' ? null : Number(value) }),
    })
    setSavedCat(c.id); setTimeout(() => setSavedCat(null), 1500)
    await load()
  }

  const prev = (() => {
    const s = scales.find(x => x.id === prevScale)
    const c = categories.find(x => x.id === prevCat)
    if (!s || !c || c.passing_score == null || prevGrade === '') return null
    return convertGrade(Number(prevGrade), s, c.passing_score)
  })()

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-6">
      {/* Escalas de conversión */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Escalas de conversión</h2>
        <p className="text-xs text-gray-500 mb-4">Define la escala de cada país/institución de origen. Cada convalidación elegirá una de estas.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">País</th>
                <th className="py-2 pr-3">Mín</th><th className="py-2 pr-3">Máx</th><th className="py-2 pr-3">Aprobación</th><th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {scales.map(s => (
                <tr key={s.id}>
                  <td className="py-2 pr-3 font-medium text-gray-800">{s.name}</td>
                  <td className="py-2 pr-3 text-gray-500">{s.country ?? '—'}</td>
                  <td className="py-2 pr-3 text-gray-600">{s.origin_min}</td>
                  <td className="py-2 pr-3 text-gray-600">{s.origin_max}</td>
                  <td className="py-2 pr-3 text-gray-600">{s.origin_passing}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => delScale(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {/* fila para agregar */}
              <tr className="bg-gray-50/50">
                <td className="py-2 pr-2"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Perú 0–20" className="w-full border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                <td className="py-2 pr-2"><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Perú" className="w-full border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                <td className="py-2 pr-2"><input type="number" value={form.origin_min} onChange={e => setForm({ ...form, origin_min: e.target.value })} placeholder="0" className="w-16 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                <td className="py-2 pr-2"><input type="number" value={form.origin_max} onChange={e => setForm({ ...form, origin_max: e.target.value })} placeholder="20" className="w-16 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                <td className="py-2 pr-2"><input type="number" value={form.origin_passing} onChange={e => setForm({ ...form, origin_passing: e.target.value })} placeholder="11" className="w-16 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                <td className="py-2 text-right">
                  <button onClick={addScale} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Agregar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Nota de aprobación por categoría (destino) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Nota de aprobación por categoría (destino)</h2>
        <p className="text-xs text-gray-500 mb-4">Nuestra nota mínima aprobatoria (0–100) según la categoría del programa. Ancla la conversión.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-700 flex-1 truncate">{c.name}</span>
              <input
                type="number" defaultValue={c.passing_score ?? ''} placeholder="70"
                onBlur={e => { if (String(c.passing_score ?? '') !== e.target.value) saveCategory(c, e.target.value) }}
                className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
              {savedCat === c.id ? <Check className="w-4 h-4 text-green-500" /> : <Save className="w-4 h-4 text-gray-300" />}
            </div>
          ))}
          {categories.length === 0 && <p className="text-xs text-gray-400">No hay categorías de programa.</p>}
        </div>
      </div>

      {/* Previsualización de conversión */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2"><Calculator className="w-4 h-4 text-gray-400" /> Probar conversión</h2>
        <p className="text-xs text-gray-500 mb-4">Verifica cómo queda una nota antes de convalidar.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Escala (origen)</label>
            <select value={prevScale} onChange={e => setPrevScale(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Elegir…</option>
              {scales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Categoría (destino)</label>
            <select value={prevCat} onChange={e => setPrevCat(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Elegir…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}{c.passing_score == null ? ' (sin nota)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nota origen</label>
            <input type="number" value={prevGrade} onChange={e => setPrevGrade(e.target.value)} placeholder="15" className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div className="ml-2">
            <label className="block text-xs text-gray-500 mb-1">= Nota 0–100</label>
            <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 font-semibold text-sm min-w-[70px] text-center">
              {prev != null ? prev : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
