'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Bot, User, RefreshCw, Ticket, CheckCircle, XCircle } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ticketProposal?: { subject: string; description: string; contactName?: string; contactEmail?: string; phone?: string }
  ticketCreated?: boolean
  ticketNumber?: string
}

interface Props {
  initialMessage?: string
  contactEmail?: string
  studentContext?: string
  language?: string
  onReset?: () => void
  showReset?: boolean
  compact?: boolean
}

const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university')

export function ChatUI({
  initialMessage = 'Hola, soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?',
  contactEmail,
  studentContext,
  language = 'es',
  onReset,
  showReset = false,
  compact = false,
}: Props) {
  const sessionId = useMemo(() => crypto.randomUUID(), [])
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: initialMessage }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [creatingTicket, setCreatingTicket] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    try {
      const resp = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          contactEmail,
          studentContext,
          sessionId,
          source: compact ? 'widget' : 'web',
        }),
      })

      if (!resp.body) throw new Error('No stream')
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let proposal: Message['ticketProposal'] | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              assistantMsg.content += parsed.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...assistantMsg }
                return updated
              })
            }
            if (parsed.action === 'confirm_ticket') {
              proposal = { subject: parsed.subject, description: parsed.description, contactName: parsed.contactName, contactEmail: parsed.contactEmail, phone: parsed.phone }
            }
          } catch { /* noop */ }
        }
      }

      if (proposal) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...assistantMsg, ticketProposal: proposal! }
          return updated
        })
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Lo siento, ocurrió un error. Por favor intenta de nuevo.' }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  async function confirmTicket(msgIndex: number, confirm: boolean) {
    const msg = messages[msgIndex]
    if (!msg?.ticketProposal) return

    if (!confirm) {
      setMessages(prev => {
        const updated = [...prev]
        updated[msgIndex] = { ...msg, ticketProposal: undefined }
        return updated
      })
      return
    }

    setCreatingTicket(true)
    try {
      const resp = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          contactEmail: msg.ticketProposal.contactEmail ?? contactEmail,
          confirmTicket: {
            subject: msg.ticketProposal.subject,
            description: msg.ticketProposal.description,
            contactName: msg.ticketProposal.contactName,
            contactEmail: msg.ticketProposal.contactEmail ?? contactEmail,
            phone: msg.ticketProposal.phone,
          },
        }),
      })
      const result = await resp.json() as { ticketCreated?: boolean; ticketNumber?: string }
      setMessages(prev => {
        const updated = [...prev]
        updated[msgIndex] = {
          ...msg,
          ticketProposal: undefined,
          ticketCreated: true,
          ticketNumber: result.ticketNumber,
        }
        return updated
      })
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[msgIndex] = { ...msg, ticketProposal: undefined }
        return updated
      })
    } finally {
      setCreatingTicket(false)
    }
  }

  const t = {
    placeholder: language === 'en' ? 'Type your message...' : language === 'pt' ? 'Digite sua mensagem...' : 'Escribe tu consulta...',
    ticketQuestion: language === 'en' ? 'Would you like me to create a support ticket?' : '¿Deseas que cree este ticket de soporte?',
    yes: language === 'en' ? 'Yes, create it' : 'Sí, crear ticket',
    no: language === 'en' ? 'No, thanks' : 'No, gracias',
    ticketCreated: language === 'en' ? 'Ticket created' : 'Ticket creado',
    advisorContact: language === 'en' ? 'An advisor will contact you soon.' : 'Un asesor te contactará pronto.',
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'flex-1'} overflow-hidden`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1`}>
                <Bot className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`} />
              </div>
            )}
            <div className={`${compact ? 'max-w-[80%]' : 'max-w-[75%]'}`}>
              <div className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.content || (loading && i === messages.length - 1 ? '...' : '')}
              </div>

              {/* Propuesta de ticket — requiere confirmación */}
              {msg.ticketProposal && (
                <div className="mt-2 border border-orange-200 bg-orange-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Ticket className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-orange-700">{t.ticketQuestion}</p>
                      <p className="text-xs text-orange-600 mt-0.5">Asunto: {msg.ticketProposal.subject}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmTicket(i, true)}
                      disabled={creatingTicket}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {creatingTicket ? 'Creando...' : t.yes}
                    </button>
                    <button
                      onClick={() => confirmTicket(i, false)}
                      disabled={creatingTicket}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-100 text-gray-600 text-xs font-medium rounded-lg transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {t.no}
                    </button>
                  </div>
                </div>
              )}

              {/* Ticket creado */}
              {msg.ticketCreated && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-600">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {t.ticketCreated}{msg.ticketNumber ? ` #${msg.ticketNumber}` : ''} — {t.advisorContact}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1`}>
                <User className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-gray-500`} />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-3 border-t border-gray-100 flex gap-2 items-end bg-white flex-shrink-0">
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            title="Nueva conversación"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage(e as unknown as React.FormEvent)
            }
          }}
          placeholder={t.placeholder}
          rows={1}
          disabled={loading}
          className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          style={{ minHeight: '42px', maxHeight: '120px' }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
