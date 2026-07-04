'use client'

import { useState } from 'react'
import { Bot, BookOpen } from 'lucide-react'
import { SofiaPromptEditor } from './prompt-editor'
import { KnowledgeManager } from './knowledge-manager'

interface BotRow {
  key: string
  name: string
  role: string | null
  prompt: string
  updated_at: string | null
}

export function SofiaConfigTabs({ bots }: { bots: BotRow[] }) {
  const [botKey, setBotKey] = useState(bots[0]?.key ?? 'sofia')
  const [tab, setTab] = useState<'prompt' | 'knowledge'>('prompt')
  const bot = bots.find(b => b.key === botKey) ?? bots[0]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Selector de bot */}
      {bots.length > 1 && (
        <div className="flex gap-2 mb-5">
          {bots.map(b => (
            <button
              key={b.key}
              onClick={() => setBotKey(b.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                botKey === b.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {b.name}
              <span className={`text-xs ${botKey === b.key ? 'text-blue-100' : 'text-gray-400'}`}>
                · {b.role ?? 'bot'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Pestañas */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('prompt')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'prompt' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bot className="w-4 h-4" /> Prompt maestro
        </button>
        <button
          onClick={() => setTab('knowledge')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'knowledge' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Base de conocimientos
        </button>
      </div>

      {tab === 'prompt' ? (
        <SofiaPromptEditor
          key={botKey}
          botKey={botKey}
          botName={bot?.name ?? ''}
          initialPrompt={bot?.prompt ?? ''}
          updatedAt={bot?.updated_at ?? null}
        />
      ) : (
        <KnowledgeManager key={botKey} botKey={botKey} />
      )}
    </div>
  )
}
