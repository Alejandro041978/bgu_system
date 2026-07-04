'use client'

import { useState } from 'react'
import { Save, RefreshCw, Bot, Info, CheckCircle, AlertCircle } from 'lucide-react'

interface Props {
  botKey: string
  botName: string
  initialPrompt: string
  updatedAt: string | null
}

export function SofiaPromptEditor({ botKey, botName, initialPrompt, updatedAt }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  async function savePrompt() {
    setSaving(true)
    setStatus(null)
    try {
      const resp = await fetch('/api/sofia/save-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, bot: botKey }),
      })
      if (!resp.ok) throw new Error('Error al guardar')
      setStatus({ type: 'success', msg: 'Prompt guardado correctamente.' })
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) })
    } finally {
      setSaving(false)
    }
  }

  async function regeneratePrompt() {
    if (!confirm('¿Regenerar el prompt con IA? Esto tomará ~1-2 minutos y mejorará el prompt actual con los últimos tickets.')) return
    setRegenerating(true)
    setStatus(null)
    try {
      const resp = await fetch('/api/cron/build-prompt', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      })
      if (!resp.ok) {
        const err = await resp.json() as { error?: string }
        throw new Error(err.error ?? 'Error al regenerar')
      }
      const result = await resp.json() as { promptLength?: number; ticketCount?: number }
      setStatus({
        type: 'success',
        msg: `Prompt regenerado con ${result.ticketCount ?? '?'} tickets. Recarga la página para ver los cambios.`,
      })
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) })
    } finally {
      setRegenerating(false)
    }
  }

  const lastUpdate = updatedAt
    ? new Date(updatedAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Nunca'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Editor */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Prompt Maestro de {botName}</p>
              <p className="text-xs text-gray-500">Este texto define toda la personalidad y comportamiento del asistente. Última actualización: {lastUpdate}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {botKey === 'sofia' && (
              <button
                onClick={regeneratePrompt}
                disabled={regenerating || saving}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                {regenerating ? 'Regenerando...' : 'Regenerar con IA'}
              </button>
            )}
            <button
              onClick={savePrompt}
              disabled={saving || regenerating}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 px-6 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Puedes editar este texto directamente. Usa <strong>Guardar cambios</strong> para aplicar tu edición manualmente.
            Usa <strong>Regenerar con IA</strong> para que Claude mejore el prompt tomando tu versión actual como base — nunca borrará lo que escribiste.
          </span>
        </div>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="w-full h-[60vh] p-6 text-sm font-mono text-gray-800 leading-relaxed resize-none focus:outline-none"
          placeholder="El prompt maestro aparecerá aquí una vez que ejecutes el cron por primera vez..."
          spellCheck={false}
        />

        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${prompt.length > 12000 ? 'text-red-600' : prompt.length > 9000 ? 'text-amber-600' : 'text-gray-500'}`}>
              {prompt.length.toLocaleString()} / 12,000 caracteres recomendados
            </span>
            <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${prompt.length > 12000 ? 'bg-red-500' : prompt.length > 9000 ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${Math.min((prompt.length / 12000) * 100, 100)}%` }}
              />
            </div>
          </div>
          {status && (
            <div className={`flex items-center gap-2 text-xs ${status.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {status.type === 'success'
                ? <CheckCircle className="w-4 h-4" />
                : <AlertCircle className="w-4 h-4" />}
              {status.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
