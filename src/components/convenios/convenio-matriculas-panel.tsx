'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Loader2, GraduationCap } from 'lucide-react'

interface Matricula {
  id: string
  convenio_id: string
  nombre: string
  documento_identidad?: string
  carrera?: string
  periodo?: string
  estado: string
  fecha_matricula?: string
  observaciones?: string
  created_at: string
}

const ESTADOS = [
  { value: 'activo', label: 'Activo' },
  { value: 'graduado', label: 'Graduado' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'suspendido', label: 'Suspendido' },
]

const ESTADO_COLORS: Record<string, string> = {
  activo: 'bg-green-100 text-green-700',
  graduado: 'bg-blue-100 text-blue-700',
  retirado: 'bg-red-100 text-red-700',
  suspendido: 'bg-amber-100 text-amber-700',
}

const emptyForm = {
  nombre: '', documento_identidad: '', carrera: '',
  periodo: '', estado: 'activo', fecha_matricula: '', observaciones: '',
}

interface Props {
  convenioId: string
  convenioNombre: string
  onClose: () => void
  onCountChange?: (count: number) => void
}

export function ConvenioMatriculasPanel({ convenioId, convenioNombre, onClose, onCountChange }: Props) {
  const [matriculas, setMatriculas] = useState<Matricula[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/convenios/matriculas?convenio_id=${convenioId}`)
      .then(r => r.json())
      .then((d: Matricula[]) => {
        setMatriculas(d)
        setLoading(false)
        onCountChange?.(d.length)
      })
      .catch(() => setLoading(false))
  }, [convenioId, onCountChange])

  function setField(key: string, value: string) {
    setForm(p => ({ ...p, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/convenios/matriculas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          convenio_id: convenioId,
          nombre: form.nombre,
          documento_identidad: form.documento_identidad || undefined,
          carrera: form.carrera || undefined,
          periodo: form.periodo || undefined,
          estado: form.estado,
          fecha_matricula: form.fecha_matricula || undefined,
          observaciones: form.observaciones || undefined,
        }),
      })
      const data = await res.json() as Matricula & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      const updated = [data, ...matriculas]
      setMatriculas(updated)
      onCountChange?.(updated.length)
      setShowForm(false)
      setForm({ ...emptyForm })
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la matrícula de "${nombre}"?`)) return
    const res = await fetch('/api/convenios/matriculas', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      const updated = matriculas.filter(m => m.id !== id)
      setMatriculas(updated)
      onCountChange?.(updated.length)
    } else {
      const d = await res.json() as { error?: string }
      alert(d.error ?? 'Error al eliminar')
    }
  }

  const fmt = (d?: string) => d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">Matrículas del convenio</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{convenioNombre}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Agregar matrícula
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Nueva matrícula</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
                  <input
                    required value={form.nombre}
                    onChange={e => setField('nombre', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="Nombre del estudiante"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Documento de identidad</label>
                  <input
                    value={form.documento_identidad}
                    onChange={e => setField('documento_identidad', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="DNI / Pasaporte"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setField('estado', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {ESTADOS.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Carrera / Programa</label>
                  <input
                    value={form.carrera}
                    onChange={e => setField('carrera', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="Ej. Ingeniería Civil"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Período académico</label>
                  <input
                    value={form.periodo}
                    onChange={e => setField('periodo', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="Ej. 2026-I"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de matrícula</label>
                  <input
                    type="date" value={form.fecha_matricula}
                    onChange={e => setField('fecha_matricula', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                  <textarea
                    rows={2} value={form.observaciones}
                    onChange={e => setField('observaciones', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
                    placeholder="Notas adicionales"
                  />
                </div>
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm({ ...emptyForm }); setError(null) }}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          )}

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : matriculas.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <GraduationCap className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay matrículas registradas para este convenio.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {matriculas.length} matrícula{matriculas.length !== 1 ? 's' : ''}
              </p>
              {matriculas.map(m => (
                <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:border-gray-300 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                    {m.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{m.nombre}</p>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[m.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ESTADOS.find(e => e.value === m.estado)?.label ?? m.estado}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {m.documento_identidad && <span className="text-xs text-gray-500">{m.documento_identidad}</span>}
                      {m.carrera && <span className="text-xs text-gray-500">{m.carrera}</span>}
                      {m.periodo && <span className="text-xs text-gray-500">Período: {m.periodo}</span>}
                      {m.fecha_matricula && <span className="text-xs text-gray-500">Matrícula: {fmt(m.fecha_matricula)}</span>}
                    </div>
                    {m.observaciones && <p className="text-xs text-gray-400 mt-1">{m.observaciones}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(m.id, m.nombre)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Eliminar matrícula"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
