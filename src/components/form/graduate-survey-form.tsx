'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, GraduationCap } from 'lucide-react'

// ---------------------------------------------------------------------------
// Encuesta pública de titulados (es/en). Fiel al cuestionario de Dirección;
// nombre/año/programa no se preguntan: el token ya identifica al estudiante.
// ---------------------------------------------------------------------------
interface Opcion { id: string; es: string; en: string }
interface Pregunta {
  id: string; tipo: 'choice' | 'multi' | 'likert' | 'texto'; seccion: string
  es: string; en: string; opciones?: Opcion[]; soloEmpleado?: boolean; requerida: boolean
}
interface Data {
  language: 'es' | 'en'; completed: boolean; first_name: string | null
  secciones: Record<string, { es: string; en: string }>
  preguntas: Pregunta[]
}

const EMPLEADO_IDS = new Set(['empleado_tc', 'empleado_tp', 'independiente'])

const T = {
  es: {
    titulo: 'Encuesta de Titulados', sub: 'Blackwell Global University',
    hola: (n: string | null) => `Hola${n ? `, ${n}` : ''} 👋`,
    intro: 'Gracias por dedicar unos minutos a esta encuesta. Tus respuestas nos ayudan a comprender el impacto de tu experiencia educativa, fortalecer nuestros programas y apoyar mejor a los estudiantes actuales y futuros.',
    likert: '1 = Totalmente en desacuerdo · 5 = Totalmente de acuerdo',
    enviar: 'Enviar encuesta', enviando: 'Enviando…',
    gracias: '¡Gracias por completar la encuesta!', graciasSub: 'Tus respuestas fueron registradas. Tu opinión fortalece a tu universidad.',
    yaEnviada: 'Esta encuesta ya fue enviada anteriormente. ¡Gracias por tu participación!',
    noEncontrada: 'Este enlace no es válido o expiró. Si crees que es un error, escríbenos a helpdesk@blackwell.university.',
    falta: 'Completa las preguntas marcadas antes de enviar.',
  },
  en: {
    titulo: 'Graduate Survey', sub: 'Blackwell Global University',
    hola: (n: string | null) => `Hello${n ? `, ${n}` : ''} 👋`,
    intro: 'Thank you for taking a few minutes for this survey. Your answers help us understand the impact of your educational experience, strengthen our programs, and better support current and future students.',
    likert: '1 = Strongly disagree · 5 = Strongly agree',
    enviar: 'Submit survey', enviando: 'Submitting…',
    gracias: 'Thank you for completing the survey!', graciasSub: 'Your answers were recorded. Your feedback strengthens your university.',
    yaEnviada: 'This survey was already submitted. Thank you for participating!',
    noEncontrada: 'This link is not valid or has expired. If you believe this is an error, write to helpdesk@blackwell.university.',
    falta: 'Please complete the highlighted questions before submitting.',
  },
}

export function GraduateSurveyForm({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'enviada' | 'ya_enviada' | 'no_encontrada'>('cargando')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/form/graduate-survey?token=${encodeURIComponent(token)}`).then(r => r.json()).then(d => {
      if (d.error) { setEstado('no_encontrada'); return }
      setData(d)
      setEstado(d.completed ? 'ya_enviada' : 'lista')
    }).catch(() => setEstado('no_encontrada'))
  }, [token])

  const lang: 'es' | 'en' = data?.language === 'en' ? 'en' : 'es'
  const t = T[lang]
  const empleado = EMPLEADO_IDS.has(String(answers['situacion_laboral'] ?? ''))

  const visibles = useMemo(() =>
    (data?.preguntas ?? []).filter(p => !p.soloEmpleado || empleado), [data, empleado])

  async function enviar() {
    setEnviando(true); setError(null)
    const r = await fetch('/api/form/graduate-survey', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, answers }),
    })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(d.error ?? t.falta); return }
    setEstado('enviada')
  }

  if (estado === 'cargando') return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>

  const Marco = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-[#1a34a8] to-blue-600 text-white rounded-t-2xl px-6 py-6 text-center">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-90" />
          <h1 className="text-xl font-bold">{t.titulo}</h1>
          <p className="text-blue-100 text-sm">{t.sub}</p>
        </div>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-2xl p-6">{children}</div>
      </div>
    </div>
  )

  if (estado === 'no_encontrada') return <Marco><p className="text-sm text-gray-600 text-center py-8">{t.noEncontrada}</p></Marco>
  if (estado === 'ya_enviada') return <Marco><p className="text-sm text-green-700 text-center py-8 flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5" />{t.yaEnviada}</p></Marco>
  if (estado === 'enviada') return (
    <Marco>
      <div className="text-center py-10">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-lg font-semibold text-gray-900">{t.gracias}</p>
        <p className="text-sm text-gray-500 mt-1">{t.graciasSub}</p>
      </div>
    </Marco>
  )

  let seccionActual = ''
  return (
    <Marco>
      <p className="text-[15px] text-gray-800 font-medium">{t.hola(data?.first_name ?? null)}</p>
      <p className="text-sm text-gray-500 mt-1 mb-6 leading-relaxed">{t.intro}</p>

      <div className="space-y-5">
        {visibles.map(p => {
          const titSeccion = p.seccion !== seccionActual ? data?.secciones[p.seccion]?.[lang] : null
          seccionActual = p.seccion
          const v = answers[p.id]
          return (
            <div key={p.id}>
              {titSeccion && (
                <div className="mt-2 mb-3 pb-1 border-b border-gray-200">
                  <p className="text-sm font-bold text-[#1a34a8]">{titSeccion}</p>
                  {p.tipo === 'likert' && <p className="text-[11px] text-gray-400 mt-0.5">{t.likert}</p>}
                </div>
              )}
              <p className="text-sm text-gray-800 mb-1.5">
                {p[lang]}{p.requerida && (!p.soloEmpleado || empleado) && <span className="text-red-400"> *</span>}
              </p>
              {p.tipo === 'likert' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setAnswers(a => ({ ...a, [p.id]: n }))}
                      className={`w-10 h-10 rounded-lg border text-sm font-semibold ${v === n ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {p.tipo === 'choice' && (
                <div className="space-y-1.5">
                  {(p.opciones ?? []).map(o => (
                    <label key={o.id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name={p.id} checked={v === o.id} onChange={() => setAnswers(a => ({ ...a, [p.id]: o.id }))}
                        className="mt-0.5 w-4 h-4 text-blue-600" />
                      {o[lang]}
                    </label>
                  ))}
                </div>
              )}
              {p.tipo === 'multi' && (
                <div className="space-y-1.5">
                  {(p.opciones ?? []).map(o => {
                    const arr: string[] = Array.isArray(v) ? v : []
                    const marcada = arr.includes(o.id)
                    return (
                      <label key={o.id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={marcada}
                          onChange={() => setAnswers(a => ({ ...a, [p.id]: marcada ? arr.filter(x => x !== o.id) : [...arr, o.id] }))}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600" />
                        {o[lang]}
                      </label>
                    )
                  })}
                </div>
              )}
              {p.tipo === 'texto' && (
                <input value={v ?? ''} onChange={e => setAnswers(a => ({ ...a, [p.id]: e.target.value }))} maxLength={300}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={enviar} disabled={enviando}
        className="mt-6 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold">
        {enviando ? t.enviando : t.enviar}
      </button>
    </Marco>
  )
}
