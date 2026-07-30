'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Pencil, Trash2, X, Settings } from 'lucide-react'

interface TramiteType {
  id: string; name: string; description: string | null
  price: number; currency: string; charge_concept: number | null
  request_note_label: string | null; instructions: string | null
  requires_situation: string | null; requires_situation_note: string | null
  active: boolean
}
interface Concept { type_code: number; abbr: string | null; name: string }

// Las mismas situaciones que la ficha del estudiante: si aquí se pudiera
// escribir libre, un requisito con un valor inexistente bloquearía el trámite
// para todo el mundo sin que se notara por qué.
const SITUACIONES = ['activo', 'egresado', 'IW', 'LOA', 'campus socio']

const vacio = (): Partial<TramiteType> => ({
  name: '', description: '', price: 0, currency: 'USD', charge_concept: null,
  request_note_label: '', instructions: '', requires_situation: '', requires_situation_note: '', active: true,
})

export function TramiteTypesConfig({ onChanged }: { onChanged?: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [types, setTypes] = useState<TramiteType[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [usos, setUsos] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<Partial<TramiteType> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/registrar/tramite-types')
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setError(d.error ?? 'Error'); return }
    setError(null)
    setTypes(d.types ?? []); setConcepts(d.concepts ?? []); setUsos(d.usos ?? {})
  }, [])
  useEffect(() => { if (abierto) load() }, [abierto, load])

  async function guardar() {
    if (!form?.name?.trim()) { setError('El nombre es obligatorio'); return }
    setBusy(true); setError(null)
    const res = await fetch('/api/registrar/tramite-types', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    setForm(null); load(); onChanged?.()
  }

  async function borrar(t: TramiteType) {
    if (!confirm(`¿Borrar "${t.name}"?`)) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/registrar/tramite-types?id=${t.id}`, { method: 'DELETE' })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setError(d.error ?? 'No se pudo borrar'); return }
    load(); onChanged?.()
  }

  const set = (k: keyof TramiteType, v: unknown) => setForm(f => ({ ...(f ?? {}), [k]: v }))

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
        <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-gray-400" /> Tipos de trámite
        </span>
        <span className="text-xs text-gray-400">{abierto ? 'ocultar' : 'configurar'}</span>
      </button>

      {abierto && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {error && <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{error}</p>}

          {loading ? (
            <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <div className="space-y-1.5">
              {types.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800">
                      {t.name}
                      {!t.active && <span className="ml-2 text-[10.5px] uppercase tracking-wide text-gray-400">inactivo</span>}
                    </p>
                    <p className="text-[11.5px] text-gray-500">
                      {t.currency} {Number(t.price).toFixed(2)}
                      {t.requires_situation ? ` · solo situación ${t.requires_situation}` : ''}
                      {usos[t.id] ? ` · ${usos[t.id]} solicitud(es)` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setForm({ ...t })} className="p-1.5 text-gray-400 hover:text-blue-600" title="Editar"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => borrar(t)} disabled={busy} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40" title="Borrar"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {types.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Sin tipos de trámite.</p>}
            </div>
          )}

          {!form && (
            <button onClick={() => setForm(vacio())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50">
              <Plus className="w-4 h-4" /> Nuevo tipo de trámite
            </button>
          )}

          {form && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">{form.id ? 'Editar trámite' : 'Nuevo trámite'}</h4>
                <button onClick={() => setForm(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block sm:col-span-2"><span className="block text-xs text-gray-500 mb-1">Nombre *</span>
                  <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} className={inp} /></label>
                <label className="block"><span className="block text-xs text-gray-500 mb-1">Precio</span>
                  <input type="number" step="0.01" min="0" value={form.price ?? 0} onChange={e => set('price', e.target.value)} className={inp} /></label>
              </div>

              <label className="block"><span className="block text-xs text-gray-500 mb-1">Descripción (la ve el estudiante)</span>
                <input value={form.description ?? ''} onChange={e => set('description', e.target.value)} className={inp} /></label>

              <label className="block">
                <span className="block text-xs text-gray-500 mb-1">Concepto de cargo</span>
                <select value={form.charge_concept ?? ''} onChange={e => set('charge_concept', e.target.value)} className={inp}>
                  <option value="">Sin concepto</option>
                  {concepts.map(c => <option key={c.type_code} value={c.type_code}>{c.type_code} · {c.name}</option>)}
                </select>
                <span className="text-[10.5px] text-gray-400">Con qué concepto aparece la cuota en el estado de cuenta.</span>
              </label>

              <label className="block"><span className="block text-xs text-gray-500 mb-1">Pregunta obligatoria al solicitar</span>
                <input value={form.request_note_label ?? ''} onChange={e => set('request_note_label', e.target.value)} placeholder="Vacío = no se le pide nada" className={inp} /></label>

              <label className="block"><span className="block text-xs text-gray-500 mb-1">Instrucciones (qué pasa después de pagar)</span>
                <input value={form.instructions ?? ''} onChange={e => set('instructions', e.target.value)} className={inp} /></label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-xs text-gray-500 mb-1">Solo si su situación es</span>
                  <select value={form.requires_situation ?? ''} onChange={e => set('requires_situation', e.target.value)} className={inp}>
                    <option value="">Cualquiera</option>
                    {SITUACIONES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs text-gray-500 mb-1">Qué se le dice a quien no cumple</span>
                  <input value={form.requires_situation_note ?? ''} onChange={e => set('requires_situation_note', e.target.value)}
                    placeholder="Ej.: El reingreso solo pueden solicitarlo los estudiantes con una IW activa." className={inp} />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.active !== false} onChange={e => set('active', e.target.checked)} className="rounded border-gray-300" />
                Disponible en el portal del estudiante
              </label>

              <div className="flex gap-2 pt-1">
                <button onClick={guardar} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Guardar
                </button>
                <button onClick={() => setForm(null)} disabled={busy}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
