'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, BookOpen, Loader2, Trash2, Pencil, Save, X, CheckCircle, AlertCircle, Power, Upload } from 'lucide-react'

interface Article {
  id: string
  title: string
  category: string | null
  enabled: boolean
  chunk_count: number
  updated_at: string
}

interface FullArticle extends Article {
  content: string
}

const emptyForm = { title: '', category: '', content: '', enabled: true }

export function KnowledgeManager() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/sofia/knowledge')
    const data = await res.json()
    setArticles(data.articles ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startNew() {
    setForm(emptyForm)
    setEditing('new')
    setStatus(null)
  }

  async function startEdit(id: string) {
    setStatus(null)
    const res = await fetch(`/api/sofia/knowledge/${id}`)
    const data = await res.json()
    if (data.article) {
      const a = data.article as FullArticle
      setForm({ title: a.title, category: a.category ?? '', content: a.content, enabled: a.enabled })
      setEditing(id)
    }
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      setStatus({ type: 'error', msg: 'Título y contenido son obligatorios.' })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      const isNew = editing === 'new'
      const res = await fetch(isNew ? '/api/sofia/knowledge' : `/api/sofia/knowledge/${editing}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setStatus({ type: 'success', msg: `Guardado e indexado en ${data.chunks ?? 0} fragmentos.` })
      setEditing(null)
      await load()
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) })
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(a: Article) {
    await fetch(`/api/sofia/knowledge/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !a.enabled }),
    })
    await load()
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este artículo de la base de conocimientos? Esta acción no se puede deshacer.')) return
    await fetch(`/api/sofia/knowledge/${id}`, { method: 'DELETE' })
    await load()
  }

  // Mapea un registro JSONL/JSON a { title, content, category } de forma tolerante.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapRecord(r: any): { title: string; content: string; category: string | null } | null {
    const title = (r.pregunta ?? r.question ?? r.title ?? r.titulo ?? '').toString().trim()
    const answer = (r.respuesta ?? r.answer ?? r.content ?? r.text ?? r.contenido ?? '').toString().trim()
    if (!title && !answer) return null
    const keywords = Array.isArray(r.palabras_clave) ? r.palabras_clave
      : Array.isArray(r.keywords) ? r.keywords : []
    const contentParts = [title, answer]
    if (keywords.length) contentParts.push(`Palabras clave: ${keywords.join(', ')}`)
    if (r.fuente ?? r.source) contentParts.push(`Fuente: ${r.fuente ?? r.source}`)
    const cat = [r.categoria ?? r.category, r.subcategoria ?? r.subcategory].filter(Boolean).join(' / ')
    return {
      title: (title || answer).slice(0, 200),
      content: contentParts.filter(Boolean).join('\n'),
      category: cat || null,
    }
  }

  async function importFile(file: File) {
    setImporting(true)
    setStatus(null)
    try {
      const text = await file.text()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw: any[]
      const trimmed = text.trim()
      if (trimmed.startsWith('[')) {
        raw = JSON.parse(trimmed) // JSON array
      } else {
        raw = trimmed.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) // JSONL
      }
      const records = raw.map(mapRecord).filter(Boolean)
      if (records.length === 0) throw new Error('No se encontraron registros válidos en el archivo.')

      const res = await fetch('/api/sofia/knowledge/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al importar')
      setStatus({
        type: 'success',
        msg: `Importados ${data.imported} artículos (${data.chunks} fragmentos)` +
          (data.skipped ? ` · ${data.skipped} ya existían` : ''),
      })
      await load()
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Editor form ──────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {editing === 'new' ? 'Nuevo artículo' : 'Editar artículo'}
              </p>
            </div>
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Ej: Reglamento de matrícula 2026"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                <input
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  placeholder="Ej: Matrículas"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contenido</label>
              <textarea
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="Pega aquí el texto oficial: reglamento, política, preguntas frecuentes, fechas, requisitos… Sofia lo usará para responder con precisión."
                className="w-full h-[45vh] border border-gray-300 rounded-lg p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                spellCheck={false}
              />
              <p className="text-xs text-gray-400 mt-1">
                {form.content.length.toLocaleString()} caracteres · se dividirá automáticamente en fragmentos para búsqueda semántica
              </p>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Habilitado (Sofia lo usa en sus respuestas)
              </label>
              <div className="flex items-center gap-3">
                {status && (
                  <span className={`flex items-center gap-1.5 text-xs ${status.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {status.msg}
                  </span>
                )}
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Indexando...' : 'Guardar e indexar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Artículos que Sofia consulta para responder. El prompt define <em>cómo</em> se comporta; esto define <em>qué</em> sabe.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json,application/json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f) }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Importando...' : 'Importar JSON/JSONL'}
          </button>
          <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Nuevo artículo
          </button>
        </div>
      </div>

      {status && (
        <div className={`flex items-center gap-2 text-xs px-4 py-2 rounded-lg ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {status.msg}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
        </div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aún no hay artículos. Crea el primero para empezar a nutrir a Sofia.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {articles.map(a => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{a.title}</p>
                <p className="text-xs text-gray-400">
                  {a.category ? `${a.category} · ` : ''}{a.chunk_count} fragmento{a.chunk_count === 1 ? '' : 's'}
                  {!a.enabled && ' · deshabilitado'}
                </p>
              </div>
              <button onClick={() => toggleEnabled(a)} title={a.enabled ? 'Deshabilitar' : 'Habilitar'}
                className={`p-1.5 rounded-lg hover:bg-gray-100 ${a.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                <Power className="w-4 h-4" />
              </button>
              <button onClick={() => startEdit(a.id)} title="Editar" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => remove(a.id)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
