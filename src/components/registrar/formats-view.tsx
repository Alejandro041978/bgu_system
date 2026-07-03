'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, RefreshCw, FileText, AlertCircle, LayoutTemplate, Clock } from 'lucide-react'

type VisualElement = {
  type: 'background' | 'image' | string
  content: string
  styles: Record<string, string>
}

type Template = {
  id: number
  name: string
  format: string
  is_portrait: boolean
  use_two_side: boolean
  updated_at: string
  elements: VisualElement[]
  simplecert_url: string
}

// Canvas dimensions used by SimpleCert (Letter landscape = 640×480)
const CANVAS_W = 640
const CANVAS_H = 480

function CertificatePreview({ elements, is_portrait }: { elements: VisualElement[]; is_portrait: boolean }) {
  const w = is_portrait ? CANVAS_H : CANVAS_W
  const h = is_portrait ? CANVAS_W : CANVAS_H
  const bg = elements.find(e => e.type === 'background')

  return (
    <div
      className="relative overflow-hidden w-full"
      style={{ aspectRatio: `${w}/${h}` }}
    >
      {bg ? (
        <img
          src={bg.content}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gray-100" />
      )}
    </div>
  )
}

function TemplateBadge({ label }: { label: string }) {
  return (
    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
      {label}
    </span>
  )
}

function TemplateCard({ template: t }: { template: Template }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
      {/* Preview */}
      <div className="relative bg-gray-50 overflow-hidden">
        <CertificatePreview elements={t.elements} is_portrait={t.is_portrait} />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
        <a
          href={t.simplecert_url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="flex items-center gap-1.5 bg-white text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir en SimpleCert
          </span>
        </a>
      </div>

      {/* Info */}
      <div className="p-4">
        <p className="text-sm font-semibold text-gray-900 truncate" title={t.name}>{t.name}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <TemplateBadge label={t.format} />
          {t.is_portrait && <TemplateBadge label="Vertical" />}
          {t.use_two_side && <TemplateBadge label="Doble cara" />}
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          Actualizado {new Date(t.updated_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

function TemplateGroup({ title, templates }: { title: string; templates: Template[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
        <FileText className="w-4 h-4" /> {title} · {templates.length} formatos
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => <TemplateCard key={t.id} template={t} />)}
      </div>
    </div>
  )
}

export function FormatsView() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const res = await fetch('/api/registrar/formats')
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Error al cargar formatos')
    } else {
      setTemplates(await res.json() as Template[])
    }

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  const bguTemplates = templates.filter(t => t.name.startsWith('BGU'))
  const blackwellTemplates = templates.filter(t => !t.name.startsWith('BGU'))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Formatos de Certificados</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Plantillas activas en SimpleCert · {templates.length} formatos disponibles
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <a
            href="https://app.simplecert.net/build"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Abrir SimpleCert
          </a>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="bg-gray-100" style={{ aspectRatio: '640/480' }} />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 && !error ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <LayoutTemplate className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No se encontraron plantillas en SimpleCert.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {bguTemplates.length > 0 && <TemplateGroup title="BGU" templates={bguTemplates} />}
          {blackwellTemplates.length > 0 && <TemplateGroup title="Blackwell" templates={blackwellTemplates} />}
        </div>
      )}
    </div>
  )
}
