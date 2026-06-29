'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { ChatUI } from '@/components/sofia/chat-ui'

export default function ChatPage() {
  const [key, setKey] = useState(0)

  return (
    <>
      <Topbar title="Sofia IA" subtitle="Asistente Virtual BGU" />
      <div className="flex-1 flex flex-col overflow-hidden p-6">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden max-w-3xl w-full mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-blue-700 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Sofia</p>
              <p className="text-xs text-blue-200">Asistente Virtual BGU · En línea</p>
            </div>
          </div>

          <ChatUI
            key={key}
            showReset
            onReset={() => setKey(k => k + 1)}
            initialMessage="Hola, soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?"
          />
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">
          Modo interno — El widget público está en <code className="text-gray-500">/chat-widget</code>
        </p>
      </div>
    </>
  )
}
