'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Loader2, FileText, Upload, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface Convenio {
  id: string
  fecha_suscripcion: string
  tipo: string
  contraparte: string
  pais: string
  contacto_contraparte?: string
  email_contraparte?: string
  fecha_inicio?: string
  fecha_termino?: string
  oportunidad: string
  archivo_url?: string
  created_at: string
}

const TIPOS = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'continuidad', label: 'Continuidad' },
  { value: 'doble_grado', label: 'Doble Grado' },
  { value: 'representacion', label: 'Representación' },
  { value: 'otros', label: 'Otros' },
]

const OPORTUNIDADES = [
  { value: 'primer_convenio', label: 'Primer convenio' },
  { value: 'renovacion', label: 'Renovación' },
]

const TIPO_COLORS: Record<string, string> = {
  comercial: 'bg-blue-100 text-blue-700',
  continuidad: 'bg-green-100 text-green-700',
  doble_grado: 'bg-purple-100 text-purple-700',
  representacion: 'bg-orange-100 text-orange-700',
  otros: 'bg-gray-100 text-gray-600',
}

const emptyForm = {
  fecha_suscripcion: '', tipo: 'comercial', contraparte: '', pais: '',
  contacto_contraparte: '', email_contraparte: '',
  fecha_inicio: '', fecha_termino: '', oportunidad: 'primer_convenio',
}

export function ConveniosManager() {
  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTipo, setFilterTipo] = useState('')
  const [filterPais, setFilterPais] = useState('')

  useEffect(() => {
    fetch('/api/convenios')
      .then(r => r.json())
      .then((d: Convenio[]) => { setConvenios(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function set(key: string, value: string) {
    setForm(p => ({ ...p, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      let archivo_url: string | undefined
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        const upRes = await fetch('/api/convenios/upload', { method: 'POST', body: fd })
        const upData = await upRes.json() as { url?: string; error?: string }
        if (!upRes.ok) throw new Error(upData.error ?? 'Error al subir archivo')
        archivo_url = upData.url
      }

      const res = await fetch('/api/convenios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fecha_inicio: form.fecha_inicio || undefined,
          fecha_termino: form.fecha_termino || undefined,
          contacto_contraparte: form.contacto_contraparte || undefined,
          email_contraparte: form.email_contraparte || undefined,
          archivo_url,
        }),
      })
      const data = await res.json() as Convenio & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setConvenios(prev => [data, ...prev])
      setShowForm(false)
      setForm({ ...emptyForm })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, contraparte: string) {
    if (!confirm(`¿Eliminar el convenio con "${contraparte}"?`)) return
    const res = await fetch('/api/convenios', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setConvenios(prev => prev.filter(c => c.id !== id))
    else { const d = await res.json() as { error?: string }; alert(d.error ?? 'Error') }
  }

  const paises = [...new Set(convenios.map(c => c.pais))].sort()
  const filtered = convenios.filter(c =>
    (!filterTipo || c.tipo === filterTipo) &&
    (!filterPais || c.pais === filterPais)
  )

  const fmt = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Convenios institucionales</h2>
          <p className="text-sm text-gray-500">{convenios.length} convenio{convenios.length !== 1 ? 's' : ''} registrado{convenios.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowForm(o => !o)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo convenio
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <p className="text-sm font-semibold text-gray-800">Registrar convenio</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de suscripción *</label>
              <input required type="date" value={form.fecha_suscripcion}
                onChange={e => set('fecha_suscripcion', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de convenio *</label>
              <select required value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Oportunidad *</label>
              <select required value={form.oportunidad} onChange={e => set('oportunidad', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {OPORTUNIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Contraparte *</label>
              <input required value={form.contraparte} onChange={e => set('contraparte', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre de la institución o empresa" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">País *</label>
              <input required value={form.pais} onChange={e => set('pais', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Perú" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contacto contraparte</label>
              <input value={form.contacto_contraparte} onChange={e => set('contacto_contraparte', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre del contacto" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email contraparte</label>
              <input type="email" value={form.email_contraparte} onChange={e => set('email_contraparte', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="contacto@institución.edu" />
            </div>
            <div />

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de término</label>
              <input type="date" value={form.fecha_termino} onChange={e => set('fecha_termino', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Upload className="w-3 h-3 inline mr-1" />
                Archivo del convenio <span className="text-gray-400">(PDF)</span>
              </label>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <div className="flex items-center gap-2 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-blue-700 truncate flex-1">{file.name}</span>
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                    <X className="w-3.5 h-3.5 text-blue-400 hover:text-blue-600" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Seleccionar archivo
                </button>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); setFile(null); setError(null) }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : 'Guardar convenio'}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      {!loading && convenios.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los tipos</option>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterPais} onChange={e => setFilterPais(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los países</option>
            {paises.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterTipo || filterPais) && (
            <button onClick={() => { setFilterTipo(''); setFilterPais('') }}
              className="text-xs text-blue-600 hover:text-blue-700">Limpiar filtros</button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : convenios.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No hay convenios registrados. Registra el primero.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Contraparte</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">País</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Contacto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Suscripción</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Inicio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Término</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Oportunidad</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-sm">{c.contraparte}</p>
                    {c.email_contraparte && (
                      <p className="text-xs text-gray-400">{c.email_contraparte}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[c.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TIPOS.find(t => t.value === c.tipo)?.label ?? c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.pais}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{c.contacto_contraparte ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{fmt(c.fecha_suscripcion)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{fmt(c.fecha_inicio)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{fmt(c.fecha_termino)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${c.oportunidad === 'renovacion' ? 'text-amber-600' : 'text-gray-600'}`}>
                      {OPORTUNIDADES.find(o => o.value === c.oportunidad)?.label ?? c.oportunidad}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {c.archivo_url && (
                        <a href={c.archivo_url} target="_blank" rel="noopener noreferrer"
                          className="p-1 text-gray-400 hover:text-blue-500 transition-colors" title="Ver archivo">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => handleDelete(c.id, c.contraparte)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
