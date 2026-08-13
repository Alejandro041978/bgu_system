'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'

interface AdmType { id: string; category_id: string; name: string; commission: number; bonus_amount: number | null; active: boolean }
interface Cat { id: string; name: string; sigla: string | null }

const money = (n: number) => `$${Number(n).toFixed(2)}`

// Gestión de tipos de admisión y sus comisiones por categoría. Página propia
// ("Comisiones"); el resumen de comisiones por asesora vive en Ventas de Admisión.
export function AdmissionCommissions() {
  const [types, setTypes] = useState<AdmType[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tCat, setTCat] = useState('')
  const [tName, setTName] = useState('')
  const [tComm, setTComm] = useState('')
  // Bono Cash del tipo: vacío = este tipo no lo tiene, y la casilla no se ofrece
  // en la venta. Cero sería otra cosa: un bono que existe y vale nada.
  const [tBono, setTBono] = useState('')

  const load = useCallback(async () => {
    const d = await fetch('/api/sales/admissions').then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setTypes(d.types ?? []); setCategories(d.categories ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function createType() {
    if (!tCat || !tName.trim()) return
    const d = await fetch('/api/sales/admission-types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: tCat, name: tName, commission: Number(tComm) || 0, bonus_amount: tBono.trim() === '' ? null : Number(tBono) }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    setTName(''); setTComm(''); setTBono('')
    load()
  }

  async function patchType(id: string, patch: Record<string, unknown>) {
    const d = await fetch('/api/sales/admission-types', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load()
  }

  async function removeType(id: string) {
    if (!confirm('¿Borrar este tipo de admisión?')) return
    const d = await fetch(`/api/sales/admission-types?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load()
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Tipos de admisión por categoría</p>
        <p className="text-[11px] text-gray-400">Cambiar una comisión rige para asignaciones NUEVAS: las ventas ya asignadas conservan la comisión con que se registraron.</p>
        <div className="flex gap-2 flex-wrap items-end">
          <select value={tCat} onChange={e => setTCat(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white w-72">
            <option value="">Categoría…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={tName} onChange={e => setTName(e.target.value)} placeholder="Nombre (Interna, Externa, Convenio…)" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-64" />
          <input value={tComm} onChange={e => setTComm(e.target.value)} placeholder="Comisión USD" inputMode="decimal" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-28" />
          <input value={tBono} onChange={e => setTBono(e.target.value)} placeholder="Bono Cash USD" inputMode="decimal" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-28" />
          <button onClick={createType} disabled={!tCat || !tName.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"><Plus className="w-3.5 h-3.5" />Crear</button>
        </div>
        <div className="divide-y divide-gray-50">
          {categories.map(c => {
            const ts = types.filter(t => t.category_id === c.id)
            if (!ts.length) return null
            return (
              <div key={c.id} className="py-2">
                <p className="text-xs font-medium text-gray-500 mb-1">{c.name}</p>
                <div className="flex flex-wrap gap-2">
                  {ts.map(t => (
                    <span key={t.id} className={`inline-flex items-center gap-2 text-xs rounded-lg border px-2 py-1 ${t.active ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-gray-100 bg-gray-50/50 text-gray-400 line-through'}`}>
                      {t.name} · {money(t.commission)}
                      {t.bonus_amount != null && <span className="text-emerald-700">+ {money(t.bonus_amount)} bono</span>}
                      <button onClick={() => { const v = prompt(`Nueva comisión para "${t.name}" (USD):`, String(t.commission)); if (v != null && v.trim() !== '') patchType(t.id, { commission: Number(v) }) }} className="text-blue-500 hover:text-blue-700">editar</button>
                      <button onClick={() => {
                        const v = prompt(`Bono Cash de "${t.name}" en USD.\n\nDéjalo vacío para que este tipo no tenga bono: entonces la casilla no se ofrece al asignar la venta.`, t.bonus_amount == null ? '' : String(t.bonus_amount))
                        if (v != null) patchType(t.id, { bonus_amount: v.trim() === '' ? null : Number(v) })
                      }} className="text-emerald-600 hover:text-emerald-800">bono</button>
                      <button onClick={() => patchType(t.id, { active: !t.active })} className="text-amber-500 hover:text-amber-700">{t.active ? 'desactivar' : 'activar'}</button>
                      <button onClick={() => removeType(t.id)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          {types.length === 0 && <p className="text-xs text-gray-400 py-2">Aún no hay tipos de admisión. Crea el primero arriba.</p>}
        </div>
      </div>
    </div>
  )
}
