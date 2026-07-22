'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, User, Hand, CheckCircle2, RotateCcw, MessageSquare, Inbox, Mail, Layers, Check, CheckCheck, AlertTriangle, Tag } from 'lucide-react'

// Glifo de WhatsApp (lucide no trae íconos de marca)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="WhatsApp">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.511-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

// Vistos del mensaje saliente de WhatsApp (estado que reporta Twilio)
function DeliveryTicks({ status }: { status: string | null | undefined }) {
  if (!status) return null
  if (status === 'failed' || status === 'undelivered') {
    return <AlertTriangle className="inline w-3.5 h-3.5 text-red-300" aria-label="No entregado" />
  }
  if (status === 'read') return <CheckCheck className="inline w-3.5 h-3.5 text-cyan-300" aria-label="Leído" />
  if (status === 'delivered') return <CheckCheck className="inline w-3.5 h-3.5 text-blue-200" aria-label="Entregado" />
  return <Check className="inline w-3.5 h-3.5 text-blue-200" aria-label="Enviado" />
}

interface Conversation {
  id: string
  case_number?: number | null
  channel?: string
  customer_phone: string | null
  customer_email?: string | null
  customer_name: string | null
  subject?: string | null
  status: string
  assigned_to: string | null
  assigned_name: string | null
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  language?: string | null
  topic?: string | null
  summary?: string | null
}

function convName(c: Conversation): string {
  return c.customer_name ?? (c.channel === 'email' ? (c.customer_email ?? 'Correo') : (c.customer_phone ?? '').replace('whatsapp:', ''))
}
function convContact(c: Conversation): string {
  return c.channel === 'email' ? (c.customer_email ?? '') : (c.customer_phone ?? '').replace('whatsapp:', '')
}

const LANGS: Record<string, string> = { es: 'Español', en: 'Inglés', pt: 'Portugués', other: 'Otro' }
const TOPICS: Record<string, { label: string; color: string }> = {
  pagos:      { label: 'Pagos', color: 'bg-amber-100 text-amber-700' },
  notas:      { label: 'Notas', color: 'bg-violet-100 text-violet-700' },
  admision:   { label: 'Admisión', color: 'bg-sky-100 text-sky-700' },
  asistencia: { label: 'Asistencia', color: 'bg-blue-100 text-blue-700' },
  tramites:   { label: 'Trámites', color: 'bg-teal-100 text-teal-700' },
  tecnico:    { label: 'Técnico', color: 'bg-rose-100 text-rose-700' },
  otro:       { label: 'Otro', color: 'bg-gray-100 text-gray-600' },
}
interface Attachment { id: string; filename: string; mime_type: string | null; size_bytes: number | null; inline: boolean; url: string | null }
interface Message {
  id: string; direction: 'in' | 'out'; body: string | null; html?: string | null
  subject?: string | null; agent_name: string | null; created_at: string
  delivery_status?: string | null
  attachments?: Attachment[]
}

const fsize = (n: number | null) => {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Correo con HTML: se pinta en un iframe totalmente aislado (sandbox sin
// scripts ni same-origin) — se ve como el correo real sin riesgo de XSS.
function EmailBody({ html }: { html: string }) {
  const [h, setH] = useState(220)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
    <style>body{margin:0;padding:10px 12px;font:13px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937;word-break:break-word}img{max-width:100%;height:auto}</style>
    </head><body>${html}</body></html>`
  return (
    <iframe
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={e => {
        try {
          const d = (e.target as HTMLIFrameElement).contentDocument
          if (d) setH(Math.min(Math.max(d.body.scrollHeight + 28, 60), 640))
        } catch { /* si el navegador bloquea la lectura, queda la altura por defecto */ }
      }}
      style={{ height: h }}
      className="w-full bg-white rounded-lg border-0"
      title="Correo"
    />
  )
}

function timeLabel(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TABS = [
  { key: 'queue', label: 'Cola', icon: Inbox },
  { key: 'mine', label: 'Mías', icon: User },
  { key: 'all', label: 'Todas', icon: Layers },
  { key: 'closed', label: 'Cerradas', icon: CheckCircle2 },
] as const

type Filter = 'queue' | 'mine' | 'all' | 'closed'

export function InboxView() {
  const [filter, setFilter] = useState<Filter>('queue')
  const [lang, setLang] = useState('')
  const [topic, setTopic] = useState('')
  const [channel, setChannel] = useState('')   // '' | whatsapp | email | ticket
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [counts, setCounts] = useState<{ queue: number; mine: number; all: number }>({ queue: 0, mine: 0, all: 0 })
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [agents, setAgents] = useState<{ user_id: string; full_name: string }[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef(filter)
  const langRef = useRef(lang)
  const topicRef = useRef(topic)
  const selectedRef = useRef<string | null>(null)
  useEffect(() => { filterRef.current = filter }, [filter])
  useEffect(() => { langRef.current = lang }, [lang])
  useEffect(() => { topicRef.current = topic }, [topic])
  useEffect(() => { selectedRef.current = selected?.id ?? null }, [selected])

  async function loadList(f = filterRef.current, l = langRef.current, t = topicRef.current) {
    const res = await fetch(`/api/inbox/conversations?filter=${f}${l ? `&lang=${l}` : ''}${t ? `&topic=${t}` : ''}`)
    const data = await res.json()
    setConversations(data.conversations ?? [])
    setCounts(data.counts ?? { queue: 0, mine: 0, all: 0 })
  }

  async function loadThread(id: string) {
    const res = await fetch(`/api/inbox/conversations/${id}`)
    const data = await res.json()
    if (data.conversation) { setSelected(data.conversation); setMessages(data.messages ?? []) }
  }

  // Lista de agentes helpdesk (para "Derivar a…")
  useEffect(() => {
    fetch('/api/helpdesk/skills').then(r => r.json()).then(d => setAgents(d.agents ?? [])).catch(() => {})
  }, [])

  // Carga inicial + polling cada 5s (setState solo en callbacks async)
  useEffect(() => {
    loadList()
    const t = setInterval(() => {
      loadList()
      if (selectedRef.current) loadThread(selectedRef.current)
    }, 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function pickFilter(f: Filter) { setFilter(f); loadList(f, langRef.current, topicRef.current) }
  function pickLang(l: string) { setLang(l); loadList(filterRef.current, l, topicRef.current) }
  function pickTopic(t: string) { setTopic(t); loadList(filterRef.current, langRef.current, t) }
  function openConv(c: Conversation) { setSelected(c); loadThread(c.id) }

  async function claim() {
    if (!selected) return
    await fetch(`/api/inbox/conversations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claim' }) })
    await loadThread(selected.id); await loadList()
  }
  async function reassign(userId: string) {
    if (!selected || !userId) return
    await fetch(`/api/inbox/conversations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reassign', to_user_id: userId }) })
    await loadThread(selected.id); await loadList()
  }
  async function close() {
    if (!selected) return
    await fetch(`/api/inbox/conversations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close' }) })
    await loadThread(selected.id); await loadList()
  }
  async function reopen() {
    if (!selected) return
    await fetch(`/api/inbox/conversations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reopen' }) })
    await loadThread(selected.id); await loadList()
  }
  async function send() {
    if (!selected || !input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    const res = await fetch(`/api/inbox/conversations/${selected.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Error al enviar'); setInput(text) }
    await loadThread(selected.id); await loadList()
    setSending(false)
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)]">
      {/* Panel izquierdo: lista */}
      <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button key={t.key} onClick={() => pickFilter(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium ${filter === t.key ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {t.key === 'queue' && counts.queue > 0 && <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 text-[10px]">{counts.queue}</span>}
              {t.key === 'mine' && counts.mine > 0 && <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 text-[10px]">{counts.mine}</span>}
              {t.key === 'all' && counts.all > 0 && <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 text-[10px]">{counts.all}</span>}
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-b border-gray-50 flex gap-2">
          <select value={lang} onChange={e => pickLang(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">Todos los idiomas</option>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="other">Otro</option>
          </select>
          <select value={topic} onChange={e => pickTopic(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">Todos los temas</option>
            {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {/* Filtro por canal (auditoría: ¿están llegando los correos?) */}
        <div className="px-3 py-2 border-b border-gray-50 flex gap-1">
          {([
            ['', 'Todos', null],
            ['whatsapp', 'WhatsApp', 'wa'],
            ['email', 'Correo', 'mail'],
            ['ticket', 'Ticket', 'ticket'],
          ] as const).map(([key, label, icon]) => {
            const n = key ? conversations.filter(c => c.channel === key).length : conversations.length
            return (
              <button key={key} onClick={() => setChannel(key)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-lg border ${channel === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                {icon === 'wa' && <WhatsAppIcon className={`w-3 h-3 ${channel === key ? 'text-white' : 'text-green-600'}`} />}
                {icon === 'mail' && <Mail className={`w-3 h-3 ${channel === key ? 'text-white' : 'text-purple-500'}`} />}
                {icon === 'ticket' && <Tag className={`w-3 h-3 ${channel === key ? 'text-white' : 'text-amber-500'}`} />}
                {label} <span className="opacity-60">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-auto divide-y divide-gray-50">
          {conversations.filter(c => !channel || c.channel === channel).length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400">Sin conversaciones{channel ? ' en este canal' : ''}</div>
          ) : conversations.filter(c => !channel || c.channel === channel).map(c => (
            <button key={c.id} onClick={() => openConv(c)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selected?.id === c.id ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {c.channel === 'email'
                    ? <Mail className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    : c.channel === 'ticket'
                      ? <Tag className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      : <WhatsAppIcon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                  <p className="text-sm font-medium text-gray-800 truncate">{convName(c)}</p>
                </div>
                {c.unread_count > 0 && <span className="bg-green-500 text-white rounded-full px-1.5 text-[10px] flex-shrink-0">{c.unread_count}</span>}
              </div>
              <p className="text-xs text-gray-400 truncate mt-0.5">{c.channel === 'email' && c.subject ? c.subject : (c.last_message_preview ?? '')}</p>
              <div className="flex items-center gap-1.5 mt-1">
                {c.case_number != null && <span className="text-[10px] font-mono font-medium text-gray-500">#{c.case_number}</span>}
                {c.topic && TOPICS[c.topic] && <span className={`text-[9px] font-medium px-1.5 rounded-full ${TOPICS[c.topic].color}`}>{TOPICS[c.topic].label}</span>}
                <span className="text-[10px] text-gray-400">{timeLabel(c.last_message_at)}</span>
                {c.assigned_name && <span className="text-[10px] text-indigo-500 truncate ml-auto">· {c.assigned_name}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Panel derecho: conversación */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageSquare className="w-10 h-10 mb-3" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  {selected.channel === 'email'
                    ? <Mail className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    : selected.channel === 'ticket'
                      ? <Tag className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      : <WhatsAppIcon className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  {selected.case_number != null && <span className="text-[11px] font-mono font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Caso #{selected.case_number}</span>}
                  {convName(selected)}
                  {selected.language && <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{LANGS[selected.language] ?? selected.language}</span>}
                  {selected.topic && TOPICS[selected.topic] && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TOPICS[selected.topic].color}`}>{TOPICS[selected.topic].label}</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {selected.channel === 'email' && selected.subject ? `${selected.subject} · ` : ''}{convContact(selected)}
                  {selected.assigned_name ? ` · Atiende: ${selected.assigned_name}` : ' · Sin asignar'}</p>
              </div>
              <div className="flex items-center gap-2">
                {agents.length > 0 && (
                  <select value="" onChange={e => { if (e.target.value) { reassign(e.target.value); e.target.value = '' } }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[140px]">
                    <option value="">Derivar a…</option>
                    {agents.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
                  </select>
                )}
                {!selected.assigned_to && (
                  <button onClick={claim} className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                    <Hand className="w-3.5 h-3.5" /> Reclamar
                  </button>
                )}
                {selected.status === 'open' ? (
                  <button onClick={close} className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Cerrar
                  </button>
                ) : (
                  <button onClick={reopen} className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                  </button>
                )}
              </div>
            </div>

            {selected.summary && (
              <div className="px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-800">
                <span className="font-semibold">📋 Contexto de Sofía:</span> {selected.summary}
              </div>
            )}
            <div className="flex-1 overflow-auto p-5 space-y-3 bg-gray-50/50">
              {messages.map(m => {
                const files = (m.attachments ?? []).filter(a => !a.inline)
                const rich = m.direction === 'in' && !!m.html
                return (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`${rich ? 'w-[85%] max-w-[720px]' : 'max-w-[70%]'} rounded-2xl px-3.5 py-2 text-sm ${m.direction === 'out' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                      {rich ? <EmailBody html={m.html!} /> : <p className="whitespace-pre-wrap">{m.body}</p>}
                      {files.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {files.map(a => (
                            <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${m.direction === 'out' ? 'border-blue-300 bg-blue-500 text-white' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                              📎 <span className="max-w-[220px] truncate">{a.filename}</span>
                              {a.size_bytes ? <span className="text-gray-400">{fsize(a.size_bytes)}</span> : null}
                            </a>
                          ))}
                        </div>
                      )}
                      <p className={`text-[10px] mt-1 flex items-center gap-1 ${m.direction === 'out' ? 'text-blue-100 justify-end' : 'text-gray-400'}`}>
                        {m.direction === 'out' && m.agent_name ? `${m.agent_name} · ` : ''}{timeLabel(m.created_at)}
                        {m.direction === 'out' && <DeliveryTicks status={m.delivery_status} />}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {selected.channel === 'email' ? (
              /* Compositor de CORREO: Enter hace salto de línea (nunca envía);
                 el correo sale solo con el botón. Adiós a los correos partidos. */
              <div className="p-3 border-t border-gray-100 space-y-2">
                <p className="text-[11px] text-gray-400">
                  <b>Para:</b> {selected.customer_email ?? '—'} · <b>Asunto:</b> {selected.subject ? (/^re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`) : 'Re:'}
                  {selected.case_number != null && ` [Caso #${selected.case_number}]`}
                </p>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  rows={6} placeholder="Escribe el correo completo… (Enter hace salto de línea)"
                  className="w-full resize-y border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]" />
                <div className="flex justify-end">
                  <button onClick={send} disabled={!input.trim() || sending}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {sending ? 'Enviando…' : 'Enviar correo'}
                  </button>
                </div>
              </div>
            ) : (
              /* Chat (WhatsApp/ticket): Enter envía, Shift+Enter salto de línea */
              <div className="p-3 border-t border-gray-100">
                <div className="flex items-end gap-2">
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    rows={1} placeholder="Escribe una respuesta…"
                    className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32" />
                  <button onClick={send} disabled={!input.trim() || sending}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
