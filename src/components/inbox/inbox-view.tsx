'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, User, Hand, CheckCircle2, RotateCcw, MessageSquare, Inbox, Mail, Phone } from 'lucide-react'

interface Conversation {
  id: string
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
interface Message { id: string; direction: 'in' | 'out'; body: string | null; subject?: string | null; agent_name: string | null; created_at: string }

function timeLabel(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TABS = [
  { key: 'queue', label: 'Cola', icon: Inbox },
  { key: 'mine', label: 'Mías', icon: User },
  { key: 'closed', label: 'Cerradas', icon: CheckCircle2 },
] as const

export function InboxView() {
  const [filter, setFilter] = useState<'queue' | 'mine' | 'closed'>('queue')
  const [lang, setLang] = useState('')
  const [topic, setTopic] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [counts, setCounts] = useState<{ queue: number; mine: number }>({ queue: 0, mine: 0 })
  const [selected, setSelected] = useState<Conversation | null>(null)
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
    setCounts(data.counts ?? { queue: 0, mine: 0 })
  }

  async function loadThread(id: string) {
    const res = await fetch(`/api/inbox/conversations/${id}`)
    const data = await res.json()
    if (data.conversation) { setSelected(data.conversation); setMessages(data.messages ?? []) }
  }

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

  function pickFilter(f: 'queue' | 'mine' | 'closed') { setFilter(f); loadList(f, langRef.current, topicRef.current) }
  function pickLang(l: string) { setLang(l); loadList(filterRef.current, l, topicRef.current) }
  function pickTopic(t: string) { setTopic(t); loadList(filterRef.current, langRef.current, t) }
  function openConv(c: Conversation) { setSelected(c); loadThread(c.id) }

  async function claim() {
    if (!selected) return
    await fetch(`/api/inbox/conversations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claim' }) })
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
        <div className="flex-1 overflow-auto divide-y divide-gray-50">
          {conversations.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400">Sin conversaciones</div>
          ) : conversations.map(c => (
            <button key={c.id} onClick={() => openConv(c)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selected?.id === c.id ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {c.channel === 'email'
                    ? <Mail className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    : <Phone className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                  <p className="text-sm font-medium text-gray-800 truncate">{convName(c)}</p>
                </div>
                {c.unread_count > 0 && <span className="bg-green-500 text-white rounded-full px-1.5 text-[10px] flex-shrink-0">{c.unread_count}</span>}
              </div>
              <p className="text-xs text-gray-400 truncate mt-0.5">{c.channel === 'email' && c.subject ? c.subject : (c.last_message_preview ?? '')}</p>
              <div className="flex items-center gap-1.5 mt-1">
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
                    : <Phone className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  {convName(selected)}
                  {selected.language && <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{LANGS[selected.language] ?? selected.language}</span>}
                  {selected.topic && TOPICS[selected.topic] && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TOPICS[selected.topic].color}`}>{TOPICS[selected.topic].label}</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {selected.channel === 'email' && selected.subject ? `${selected.subject} · ` : ''}{convContact(selected)}
                  {selected.assigned_name ? ` · Atiende: ${selected.assigned_name}` : ' · Sin asignar'}</p>
              </div>
              <div className="flex items-center gap-2">
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
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${m.direction === 'out' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.direction === 'out' ? 'text-blue-100' : 'text-gray-400'}`}>
                      {m.direction === 'out' && m.agent_name ? `${m.agent_name} · ` : ''}{timeLabel(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

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
          </>
        )}
      </div>
    </div>
  )
}
