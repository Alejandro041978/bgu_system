'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

export interface Capacitacion {
  id: string
  id_capacitacion: string
  fecha_inicio: string
  fecha_termino?: string
  tipo: string
  modalidad: string
  gestion: string
  financiamiento: string
  tematica?: string
  denominacion: string
  tipo_programa: string
  entidad_capacitadora?: string
  created_at: string
}

const TIPOS = [
  { value: 'academica', label: 'Académica' },
  { value: 'administrativa', label: 'Administrativa' },
  { value: 'tecnologica', label: 'Tecnológica' },
  { value: 'etica', label: 'Ética e Inclusión' },
]
const MODALIDADES = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'online', label: 'Online' },
]
const GESTIONES = [
  { value: 'institucional', label: 'Institucional' },
  { value: 'individual', label: 'Individual' },
]
const FINANCIAMIENTOS = [
  { value: 'blackwell', label: 'Blackwell' },
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'mixto', label: 'Mixto' },
]
const TIPO_PROGRAMAS = [
  { value: 'curso_cerrado', label: 'Curso cerrado' },
  { value: 'diplomado', label: 'Diplomado' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'master', label: 'Master' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'otro', label: 'Otro' },
]

const TIPO_COLORS: Record<string, string> = {
  academica: 'bg-blue-100 text-blue-700',
  administrativa: 'bg-purple-100 text-purple-700',
  tecnologica: 'bg-green-100 text-green-700',
  etica: 'bg-orange-100 text-orange-700',
}

const emptyForm = {
  id_capacitacion: '', fecha_inicio: '', fecha_termino: '',
  tipo: 'academica', modalidad: 'presencial', gestion: 'institucional',
  financiamiento: 'blackwell', tematica: '', denominacion: '',
  tipo_programa: 'curso_cerrado', entidad_capacitadora: '',
}

export function CapacitacionesManager() {
  const [items, setItems] = useState<Capacitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTipo, setFilterTipo] = useState('')
  const [filterModalidad, setFilterModalidad] = useState('')

  useEffect(() => {
    fetch('/api/hr/capacitaciones')
      .then(r => r.json())
      .then((d: Capacitacion[]) => { setItems(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const res = await fetch('/api/hr/capacitaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fecha_termino: form.fecha_termino || undefined,
          tematica: form.tematica || undefined,
          entidad_capacitadora: form.entidad_capacitadora || undefined,
        }),
      })
      const data = await res.json() as Capacitacion & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setItems(prev => [data, ...prev])
      setShowForm(false)
      setForm({ ...emptyForm })
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la capacitación "${nombre}"?`)) return
    const res = await fetch('/api/hr/capacitaciones', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setItems(prev => prev.filter(c => c.id !== id))
    else { const d = await res.json() as { error?: string }; alert(d.error ?? 'Error') }
  }

  const filtered = items.filter(c =>
    (!filterTipo || c.tipo === filterTipo) &&
    (!filterModalidad || c.modalidad === filterModalidad)
  )

  const fmt = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const label = (arr: { value: string; label: string }[], v: string) => arr.find(a => a.value === v)?.label ?? v

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Capacitaciones</h2>
          <p className="text-sm text-gray-500">{items.length} capacitación{items.length !== 1 ? 'es' : ''} registrada{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(o => !o)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Nueva capacitación
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <p className="text-sm font-semibold text-gray-800">Nueva capacitación</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ID Capacitación *</label>
              <input required value={form.id_capacitacion} onChange={e => set('id_capacitacion', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. CAP-2026-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de inicio *</label>
              <input required type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de término</label>
              <input type="date" value={form.fecha_termino} onChange={e => set('fecha_termino', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Denominación *</label>
              <input required value={form.denominacion} onChange={e => set('denominacion', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre de la capacitación" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Entidad capacitadora</label>
              <input value={form.entidad_capacitadora} onChange={e => set('entidad_capacitadora', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. PUCP, Coursera" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo *</label>
              <select required value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Modalidad *</label>
              <select required value={form.modalidad} onChange={e => set('modalidad', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de programa *</label>
              <select required value={form.tipo_programa} onChange={e => set('tipo_programa', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {TIPO_PROGRAMAS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Gestión *</label>
              <select required value={form.gestion} onChange={e => set('gestion', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {GESTIONES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Financiamiento *</label>
              <select required value={form.financiamiento} onChange={e => set('financiamiento', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {FINANCIAMIENTOS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Temática</label>
              <input value={form.tematica} onChange={e => set('tematica', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Liderazgo, Excel avanzado" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); setError(null) }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : 'Guardar capacitación'}
            </button>
          </div>
        </form>
      )}

      {!loading && items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los tipos</option>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterModalidad} onChange={e => setFilterModalidad(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las modalidades</option>
            {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {(filterTipo || filterModalidad) && (
            <button onClick={() => { setFilterTipo(''); setFilterModalidad('') }} className="text-xs text-blue-600 hover:text-blue-700">Limpiar</button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No hay capacitaciones registradas.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-32">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Denominación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Modalidad</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Programa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Gestión</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Financ.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Inicio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Término</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{c.id_capacitacion}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-sm">{c.denominacion}</p>
                    {c.entidad_capacitadora && <p className="text-xs text-gray-400">{c.entidad_capacitadora}</p>}
                    {c.tematica && <p className="text-xs text-gray-400 italic">{c.tematica}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[c.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                      {label(TIPOS, c.tipo)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{label(MODALIDADES, c.modalidad)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{label(TIPO_PROGRAMAS, c.tipo_programa)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{label(GESTIONES, c.gestion)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{label(FINANCIAMIENTOS, c.financiamiento)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{fmt(c.fecha_inicio)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{fmt(c.fecha_termino)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(c.id, c.denominacion)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
