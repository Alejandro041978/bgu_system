'use client'

import { useState, useCallback } from 'react'
import {
  Plus, FileText, Pencil, Trash2, ChevronDown, ChevronUp,
  Save, X, Tag, Eye, EyeOff, Loader2,
} from 'lucide-react'

type Template = {
  id: string
  name: string
  description: string | null
  body: string
  variables: string[]
  status: 'active' | 'draft' | 'archived'
  created_at: string
  updated_at: string
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  draft: 'Borrador',
  archived: 'Archivado',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700 border-green-200',
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  archived: 'bg-gray-100 text-gray-500 border-gray-200',
}

function extractVariables(text: string): string[] {
  const vars = [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
  return [...new Set(vars)]
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Template>
  onSave: (t: Template) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>(initial?.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  const detectedVars = extractVariables(body)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const url = initial?.id
        ? `/api/contracts/templates/${initial.id}`
        : '/api/contracts/templates'
      const method = initial?.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, body, status }),
      })
      const data = await res.json() as Template & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error guardando')
      onSave(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const previewBody = body.replace(/\{\{(\w+)\}\}/g, (_, v) =>
    `<span class="bg-blue-100 text-blue-700 px-1 rounded font-medium">[${v}]</span>`
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del contrato *</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej. Contrato de Servicios 2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Activo</option>
            <option value="draft">Borrador</option>
            <option value="archived">Archivado</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Descripción (opcional)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Breve descripción del tipo de contrato"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-700">
            Texto del contrato *
          </label>
          <button
            type="button"
            onClick={() => setPreview(p => !p)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {preview ? 'Editar' : 'Vista previa'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Usa <code className="bg-gray-100 px-1 rounded text-blue-600 font-mono">{'{{variable}}'}</code> para campos dinámicos. Ej: <code className="bg-gray-100 px-1 rounded text-blue-600 font-mono">{'{{full_name}}'}</code>, <code className="bg-gray-100 px-1 rounded text-blue-600 font-mono">{'{{start_date}}'}</code>
        </p>

        {preview ? (
          <div
            className="min-h-[320px] border border-gray-300 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed bg-white"
            dangerouslySetInnerHTML={{ __html: previewBody }}
          />
        ) : (
          <textarea
            required
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={18}
            placeholder={`CONTRATO DE SERVICIOS\n\nConste por el presente documento el contrato de servicios que celebran:\n\nDE UNA PARTE: {{company_name}}, debidamente representada por {{representative_name}}.\n\nDE OTRA PARTE: {{full_name}}, identificado con {{document_type}} N° {{document_number}}, con domicilio en {{address}}.\n\nCLÁUSULA PRIMERA: OBJETO\nEl contratista se compromete a prestar los servicios de {{position}} a partir del {{start_date}}...\n\nCLÁUSULA SEGUNDA: REMUNERACIÓN\nLa empresa abonará la suma de {{currency}} {{salary}} mensuales.`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        )}
      </div>

      {detectedVars.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tag className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-500 mr-1">Variables detectadas:</span>
          {detectedVars.map(v => (
            <span key={v} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-mono">
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar plantilla
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 text-gray-600 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
      </div>
    </form>
  )
}

function TemplateRow({
  template,
  onUpdated,
  onDeleted,
}: {
  template: Template
  onUpdated: (t: Template) => void
  onDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`¿Eliminar la plantilla "${template.name}"?`)) return
    setDeleting(true)
    await fetch(`/api/contracts/templates/${template.id}`, { method: 'DELETE' })
    onDeleted(template.id)
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => !editing && setExpanded(e => !e)}
      >
        <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
          <FileText className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{template.name}</p>
          {template.description && (
            <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[template.status]}`}>
              {STATUS_LABEL[template.status]}
            </span>
            {template.variables.length > 0 && (
              <span className="text-xs text-gray-400">
                {template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setEditing(e => !e); setExpanded(true) }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
          <div className="text-gray-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {editing ? (
            <TemplateForm
              initial={template}
              onSave={(updated) => { onUpdated(updated); setEditing(false) }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="space-y-3">
              {template.variables.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Tag className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500 mr-1">Variables:</span>
                  {template.variables.map(v => (
                    <span key={v} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-mono">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto border border-gray-200">
                {template.body}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ContractTemplatesManager({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [creating, setCreating] = useState(false)

  const handleCreated = useCallback((t: Template) => {
    setTemplates(prev => [t, ...prev])
    setCreating(false)
  }, [])

  const handleUpdated = useCallback((t: Template) => {
    setTemplates(prev => prev.map(x => x.id === t.id ? t : x))
  }, [])

  const handleDeleted = useCallback((id: string) => {
    setTemplates(prev => prev.filter(x => x.id !== id))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Plantillas de contratos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Crea y gestiona los modelos de contratos con variables dinámicas
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {creating ? 'Cancelar' : 'Nueva plantilla'}
        </button>
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Nueva plantilla</h2>
          <TemplateForm
            onSave={handleCreated}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="space-y-3">
        {templates.length === 0 && !creating ? (
          <div className="text-center py-16 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay plantillas aún. Crea la primera.</p>
          </div>
        ) : (
          templates.map(t => (
            <TemplateRow
              key={t.id}
              template={t}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))
        )}
      </div>
    </div>
  )
}
