'use client'

import { useState } from 'react'
import { Bot, BookOpen } from 'lucide-react'
import { SofiaPromptEditor } from './prompt-editor'
import { KnowledgeManager } from './knowledge-manager'

interface Props {
  initialPrompt: string
  ticketCount: number
  convCount: number
  updatedAt: string | null
}

export function SofiaConfigTabs({ initialPrompt, ticketCount, convCount, updatedAt }: Props) {
  const [tab, setTab] = useState<'prompt' | 'knowledge'>('prompt')

  return (
    <div className="max-w-4xl mx-auto">
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
          initialPrompt={initialPrompt}
          ticketCount={ticketCount}
          convCount={convCount}
          updatedAt={updatedAt}
        />
      ) : (
        <KnowledgeManager />
      )}
    </div>
  )
}
