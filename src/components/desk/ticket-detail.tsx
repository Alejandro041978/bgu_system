'use client'

import { useState } from 'react'
import { ArrowLeft, User, Clock, Tag, MessageSquare, Bot, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import type { ZohoTicket, ZohoComment } from '@/types/zoho'
import { cn, formatDateTime, getPriorityColor, getStatusColor } from '@/lib/utils'

interface TicketDetailProps {
  ticket: ZohoTicket
  conversations: ZohoComment[]
}

export function TicketDetail({ ticket, conversations }: TicketDetailProps) {
  const [replyContent, setReplyContent] = useState('')
  const [sending, setSending] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiReview, setAiReview] = useState<null | {
    score: number
    sentiment: string
    feedback: string
    suggestions: string
    scores: { empathy: number; resolution: number; professionalism: number }
  }>(null)

  async function handleReply() {
    if (!replyContent.trim() || sending) return
    setSending(true)
    try {
      await fetch(`/api/zoho/tickets/${ticket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent }),
      })
      setReplyContent('')
    } finally {
      setSending(false)
    }
  }

  async function handleAiAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/zoho/tickets/${ticket.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversations }),
      })
      const data = await res.json()
      setAiReview(data)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href="/desk"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a tickets
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{ticket.subject}</h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', getPriorityColor(ticket.priority))}>
                  {ticket.priority}
                </span>
                <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', getStatusColor(ticket.status))}>
                  {ticket.status}
                </span>
              </div>
            </div>
            {ticket.description && (
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: ticket.description }}
              />
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">
                Conversación ({conversations.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {conversations.map((conv) => (
                <div key={conv.id} className={cn(
                  'px-6 py-4',
                  conv.authorType === 'agent' ? 'bg-blue-50/50' : ''
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                      conv.authorType === 'agent' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                    )}>
                      {conv.author?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{conv.author}</span>
                    <span className="text-xs text-gray-400">
                      {conv.authorType === 'agent' ? '· Agente' : '· Cliente'}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatDateTime(conv.createdTime)}
                    </span>
                  </div>
                  <div
                    className="text-sm text-gray-700 pl-8 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: conv.content }}
                  />
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Escribir respuesta..."
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={handleAiAnalysis}
                  disabled={analyzing || conversations.length === 0}
                  className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 disabled:opacity-40 transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  {analyzing ? 'Analizando...' : 'Analizar con IA'}
                </button>
                <button
                  onClick={handleReply}
                  disabled={!replyContent.trim() || sending}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {sending ? 'Enviando...' : 'Enviar respuesta'}
                </button>
              </div>
            </div>
          </div>

          {aiReview && (
            <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-purple-100 bg-purple-50 flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-semibold text-purple-900">Análisis de IA</h3>
                <span className="ml-auto text-2xl font-bold text-purple-600">
                  {aiReview.score}/100
                </span>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Empatía', value: aiReview.scores.empathy },
                    { label: 'Resolución', value: aiReview.scores.resolution },
                    { label: 'Profesionalismo', value: aiReview.scores.professionalism },
                  ].map((item) => (
                    <div key={item.label} className="text-center">
                      <p className="text-xl font-bold text-gray-900">{item.value}/100</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Evaluación</p>
                  <p className="text-sm text-gray-700">{aiReview.feedback}</p>
                </div>
                {aiReview.suggestions && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sugerencias</p>
                    <p className="text-sm text-gray-700">{aiReview.suggestions}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Información del ticket</h3>
            <InfoRow label="Canal" value={ticket.channel} />
            <InfoRow label="Departamento" value={ticket.departmentName ?? '—'} />
            <InfoRow label="Asignado a" value={ticket.assigneeName ?? 'Sin asignar'} />
            <InfoRow label="Equipo" value={ticket.teamName ?? '—'} />
            <InfoRow label="Creado" value={formatDateTime(ticket.createdTime)} />
            <InfoRow label="Modificado" value={formatDateTime(ticket.modifiedTime)} />
            {ticket.dueDate && (
              <InfoRow label="Vencimiento" value={formatDateTime(ticket.dueDate)} />
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Métricas de respuesta</h3>
            <InfoRow label="Respuestas totales" value={String(ticket.responseCount)} />
            <InfoRow label="Respuestas del cliente" value={String(ticket.customerResponseCount)} />
            {ticket.firstResponseTime && (
              <InfoRow label="1ª respuesta" value={formatDateTime(ticket.firstResponseTime)} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
