'use client'

import { useState } from 'react'
import { Bot, Globe, ChevronRight, Search } from 'lucide-react'
import { ChatUI } from '@/components/sofia/chat-ui'

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
]

const WELCOME: Record<string, string> = {
  es: '¡Hola! Soy Sofia, tu asistente virtual de BGU 👋\n¿En qué puedo ayudarte hoy?',
  en: "Hi! I'm Sofia, your BGU virtual assistant 👋\nHow can I help you today?",
  pt: 'Olá! Sou Sofia, sua assistente virtual da BGU 👋\nComo posso ajudá-lo hoje?',
  fr: 'Bonjour! Je suis Sofia, votre assistante virtuelle de BGU 👋\nComment puis-je vous aider?',
}

interface StudentData {
  found: boolean
  context?: string
  openCount?: number
}

type Step = 'language' | 'identify' | 'chat'

const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://bgu-system.vercel.app')

export default function ChatWidgetPage() {
  const [step, setStep] = useState<Step>('language')
  const [language, setLanguage] = useState('es')
  const [email, setEmail] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [studentData, setStudentData] = useState<StudentData | null>(null)
  const [chatKey, setChatKey] = useState(0)

  function selectLanguage(lang: string) {
    setLanguage(lang)
    setStep('identify')
  }

  async function identify(skip = false) {
    if (skip) {
      startChat(null)
      return
    }
    if (!email.trim()) return
    setLookingUp(true)
    try {
      const resp = await fetch(`${BASE_URL}/api/chat/student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await resp.json() as StudentData
      setStudentData(data)
      startChat(data)
    } catch {
      startChat(null)
    } finally {
      setLookingUp(false)
    }
  }

  function startChat(data: StudentData | null) {
    const langName = LANGUAGES.find(l => l.code === language)?.label ?? 'Español'
    const langInstruction = language !== 'es'
      ? `\n\nIMPORTANTE: El estudiante eligió ser atendido en ${langName}. Responde SIEMPRE en ese idioma.`
      : ''
    setStudentData({
      ...(data ?? { found: false }),
      context: (data?.context ?? '') + langInstruction,
    })
    setStep('chat')
  }

  const welcomeMsg = studentData?.found && (studentData as StudentData & { openCount?: number }).openCount
    ? (language === 'es'
      ? `¡Hola! Soy Sofia 👋 Te reconozco en nuestro sistema y veo que tienes ${(studentData as StudentData & { openCount?: number }).openCount} consulta(s) pendiente(s). ¿En qué puedo ayudarte hoy?`
      : WELCOME[language])
    : WELCOME[language] ?? WELCOME.es

  return (
    <div className="flex flex-col h-screen bg-white font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-700 to-blue-800 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">Sofia · BGU</p>
          <p className="text-xs text-blue-200 mt-0.5">Asistente Virtual · En línea</p>
        </div>
      </div>

      {/* STEP 1: Idioma */}
      {step === 'language' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
            <Globe className="w-6 h-6 text-blue-600" />
          </div>
          <p className="text-sm font-semibold text-gray-800 text-center">¿En qué idioma deseas ser atendido?</p>
          <p className="text-xs text-gray-400 text-center -mt-2">In which language would you like to be assisted?</p>
          <div className="w-full space-y-2 mt-2">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => selectLanguage(lang.code)}
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-700 font-medium"
              >
                {lang.label}
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Identificación */}
      {step === 'identify' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
            <Search className="w-6 h-6 text-blue-600" />
          </div>
          <p className="text-sm font-semibold text-gray-800 text-center">
            {language === 'es' ? '¿Cuál es tu correo institucional?' :
             language === 'en' ? 'What is your institutional email?' :
             language === 'pt' ? 'Qual é o seu e-mail institucional?' :
             'Quel est votre e-mail institutionnel?'}
          </p>
          <p className="text-xs text-gray-400 text-center -mt-2">
            {language === 'es' ? 'Lo usamos para personalizar tu atención con tu historial.' :
             language === 'en' ? 'We use it to personalize your support with your history.' :
             language === 'pt' ? 'Usamos para personalizar seu atendimento com seu histórico.' :
             'Nous l\'utilisons pour personnaliser votre assistance.'}
          </p>
          <input
            type="email"
            placeholder="correo@blackwell.university"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && identify()}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={() => identify()}
            disabled={!email.trim() || lookingUp}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {lookingUp ? (language === 'es' ? 'Buscando...' : 'Searching...') : (language === 'es' ? 'Continuar' : 'Continue')}
          </button>
          <button onClick={() => identify(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">
            {language === 'es' ? 'Continuar sin identificarme' : 'Continue without identifying'}
          </button>
        </div>
      )}

      {/* STEP 3: Chat */}
      {step === 'chat' && (
        <>
          <ChatUI
            key={chatKey}
            compact
            language={language}
            contactEmail={email || undefined}
            studentContext={studentData?.context}
            initialMessage={welcomeMsg}
            showReset
            onReset={() => { setStep('language'); setEmail(''); setStudentData(null); setChatKey(k => k + 1) }}
          />
          <p className="text-center text-xs text-gray-400 py-1.5 flex-shrink-0">
            Powered by <span className="font-medium text-gray-500">BGU · Sofia IA</span>
          </p>
        </>
      )}
    </div>
  )
}
