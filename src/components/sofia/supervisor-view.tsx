'use client'

import { useState } from 'react'
import { Download, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, MessageSquare, Star, ChevronDown, ChevronRight, Play } from 'lucide-react'

type Report = {
  id: string
  report_date: string
  bot_key: string
  conversations_analyzed: number
  total_messages: number
  status: 'pending' | 'completed' | 'failed'
  executive_summary: string | null
  strengths: string | null
  weaknesses: string | null
  recommendations: string | null
  knowledge_gaps: string | null
  prompt_suggestions: string | null
  full_report: string | null
  quality_score: number | null
  generated_at: string | null
  created_at: string
}

type BotOpt = { key: string; name: string; role: string | null }

function StatusBadge({ status }: { status: Report['status'] }) {
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> Completado
    </span>
  )
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
      <XCircle className="w-3 h-3" /> Error
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
      <Clock className="w-3 h-3" /> Pendiente
    </span>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const color = score >= 8 ? 'text-green-600 bg-green-50 border-green-200'
    : score >= 6 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-red-600 bg-red-50 border-red-200'
  return (
    <span className={`flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full border ${color}`}>
      <Star className="w-3.5 h-3.5" /> {score}/10
    </span>
  )
}

function Section({ title, content }: { title: string; content: string | null }) {
  if (!content) return null
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h4>
      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
        {content}
      </p>
    </div>
  )
}

export function SupervisorView({ reports: initialReports, bots }: { reports: Report[]; bots: BotOpt[] }) {
  const [botKey, setBotKey] = useState(bots[0]?.key ?? 'sofia')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runningDate, setRunningDate] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const reports = initialReports.filter(r => r.bot_key === botKey)
  const botName = bots.find(b => b.key === botKey)?.name ?? 'Bot'

  async function runFor(date: string) {
    setRunError(null)
    const res = await fetch(`/api/sofia/run-supervisor?date=${date}&bot=${botKey}`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setRunError(d.error ?? 'Error al ejecutar análisis')
      return false
    }
    return true
  }

  async function runToday() {
    setRunning(true)
    const ok = await runFor(new Date().toISOString().slice(0, 10))
    if (ok) window.location.reload(); else setRunning(false)
  }

  async function runReport(date: string) {
    setRunningDate(date)
    const ok = await runFor(date)
    if (ok) window.location.reload(); else setRunningDate(null)
  }

  return (
    <div className="space-y-6">
      {bots.length > 1 && (
        <div className="flex gap-2">
          {bots.map(b => (
            <button
              key={b.key}
              onClick={() => { setBotKey(b.key); setExpanded(null) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                botKey === b.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {b.name}
              <span className={`text-xs ${botKey === b.key ? 'text-indigo-100' : 'text-gray-400'}`}>· {b.role ?? 'bot'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{botName} · Supervisor</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Análisis diario de conversaciones con recomendaciones para mejorar el bot
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={runToday}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Analizando…' : 'Analizar ahora'}
          </button>
        </div>
      </div>

      {runError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {runError}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No hay reportes generados aún.</p>
          <p className="text-xs text-gray-400 mt-1">El análisis se ejecuta automáticamente cada día a las 5:00 AM, o pulsa "Analizar ahora".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header row */}
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(r.report_date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                    <StatusBadge status={r.status} />
                    <ScoreBadge score={r.quality_score} />
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                    <span>{r.conversations_analyzed} conversaciones</span>
                    <span>{r.total_messages} mensajes</span>
                    {r.generated_at && (
                      <span>Generado {new Date(r.generated_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.status !== 'completed' && (
                    <span
                      role="button" tabIndex={0}
                      onClick={e => { e.stopPropagation(); if (!runningDate) runReport(r.report_date) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
                    >
                      {runningDate === r.report_date ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Analizar
                    </span>
                  )}
                  {r.full_report && (
                    <a
                      href={`/api/sofia/supervisor/report/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </a>
                  )}
                  {expanded === r.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === r.id && r.status === 'completed' && (
                <div className="px-6 pb-6 border-t border-gray-100 space-y-4 pt-4">
                  <Section title="Resumen Ejecutivo" content={r.executive_summary} />
                  <Section title="Fortalezas" content={r.strengths} />
                  <Section title="Debilidades y Fallos" content={r.weaknesses} />
                  <Section title="Temas Frecuentes" content={r.prompt_suggestions} />
                  <Section title="Recomendaciones para el Prompt" content={r.recommendations} />
                  <Section title="Vacíos de Conocimiento (agregar a la base de conocimientos)" content={r.knowledge_gaps} />
                </div>
              )}
              {expanded === r.id && r.status === 'failed' && (
                <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                  <p className="text-sm text-red-600">El análisis falló. Pulsa «Analizar» para intentarlo de nuevo.</p>
                </div>
              )}
              {expanded === r.id && r.status === 'pending' && (
                <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-sm text-gray-600">
                    Este día tiene {r.conversations_analyzed} conversación(es) registrada(s) pero el análisis de IA aún no se ha ejecutado.
                    Pulsa «Analizar» para generar el reporte.
                  </p>
                  <button
                    onClick={() => runReport(r.report_date)} disabled={!!runningDate}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {runningDate === r.report_date ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {runningDate === r.report_date ? 'Analizando…' : 'Analizar este día'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
