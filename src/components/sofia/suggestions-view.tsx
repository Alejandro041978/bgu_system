'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Check, X, AlertTriangle, CheckCircle2 } from 'lucide-react'

type Suggestion = {
  id: string; bot_key: string; report_date: string | null; type: 'prompt' | 'knowledge'
  title: string; recommendation: string | null; content: string
  kb_topic: string | null; kb_question: string | null; kb_tags: string | null
  status: 'pending' | 'approved' | 'rejected'; applied_at: string | null; created_at: string
}
type BotOpt = { key: string; name: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprobada',  cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Descartada', cls: 'bg-gray-100 text-gray-500' },
}

export function SuggestionsView({ bots }: { bots: BotOpt[] }) {
  const [bot, setBot] = useState<string>('')
  const [status, setStatus] = useState<'pending' | 'all'>('pending')
  const [rows, setRows] = useState<Suggestion[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ status })
    if (bot) qs.set('bot', bot)
    const d = await fetch(`/api/sofia/suggestions?${qs}`).then(r => r.json())
    setRows(d.rows ?? []); setCounts(d.counts ?? {}); setLoading(false)
  }, [bot, status])
  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id)
    const res = await fetch('/api/sofia/suggestions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }),
    })
    const d = await res.json()
    setBusy(null)
    if (!res.ok) { alert(d.error ?? 'No se pudo aplicar'); return }
    load()
  }

  const botName = (k: string) => bots.find(b => b.key === k)?.name ?? k
  const totalPend = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Cada mejora que apruebes se aplica al bot: el ajuste se agrega a su prompt, o el dato a su base de conocimientos. Así los bots mejoran con el uso.
      </p>

      {/* Filtros por bot */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setBot('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${bot === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          Todos {totalPend > 0 && <span className="opacity-70">({totalPend})</span>}
        </button>
        {bots.map(b => (
          <button key={b.key} onClick={() => setBot(b.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${bot === b.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {b.name} {counts[b.key] ? <span className="opacity-70">({counts[b.key]})</span> : null}
          </button>
        ))}
        <span className="w-px bg-gray-200 mx-1 self-stretch" />
        <button onClick={() => setStatus('pending')} className={`px-3 py-1 rounded-lg text-xs font-medium border ${status === 'pending' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}>Pendientes</button>
        <button onClick={() => setStatus('all')} className={`px-3 py-1 rounded-lg text-xs font-medium border ${status === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}>Historial</button>
      </div>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          {status === 'pending' ? 'No hay mejoras pendientes. Los supervisores las proponen a diario cuando detectan algo que corregir.' : 'Sin historial.'}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${s.type === 'prompt' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {s.type === 'prompt' ? 'Prompt' : 'Conocimiento'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                <span className="text-[11px] text-gray-400">{botName(s.bot_key)}</span>
                <span className="text-[11px] text-gray-300 ml-auto">{s.report_date ?? s.created_at.slice(0, 10)}</span>
              </div>

              <p className="text-sm font-semibold text-gray-800 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />{s.title}
              </p>
              {s.recommendation && (
                <p className="text-sm text-gray-500 flex items-start gap-1.5 mt-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />{s.recommendation}
                </p>
              )}

              <div className="mt-2 border-l-4 border-blue-300 bg-gray-50 rounded-r px-3 py-2">
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{s.content}</p>
              </div>

              {s.type === 'knowledge' && (s.kb_topic || s.kb_question || s.kb_tags) && (
                <p className="text-[11px] text-gray-400 mt-2">
                  {s.kb_topic && <><span className="font-medium">Tema:</span> {s.kb_topic}{'  ·  '}</>}
                  {s.kb_question && <><span className="font-medium">Pregunta:</span> {s.kb_question}{'  ·  '}</>}
                  {s.kb_tags && <><span className="font-medium">Tags:</span> {s.kb_tags}</>}
                </p>
              )}

              {s.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => act(s.id, 'approve')} disabled={busy === s.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white">
                    {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Aprobar y aplicar
                  </button>
                  <button onClick={() => act(s.id, 'reject')} disabled={busy === s.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    <X className="w-4 h-4" /> Descartar
                  </button>
                </div>
              )}
              {s.status === 'approved' && s.applied_at && (
                <p className="text-[11px] text-green-600 mt-2">✓ Aplicada el {new Date(s.applied_at).toLocaleString('es-PE')}{s.type === 'prompt' ? ' — agregada al prompt' : ' — agregada a la base de conocimientos'}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
