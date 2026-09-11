'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Briefcase } from 'lucide-react'

// ---------------------------------------------------------------------------
// Encuesta pública a empleadores (es/en). Fiel al cuestionario de Dirección;
// la identificación no se pregunta: el token ya identifica al empleador y a
// sus titulados (que se muestran en la cabecera). La escala es de
// EXPECTATIVAS (1 = no cumple · 5 = supera), distinta a la de titulados.
// ---------------------------------------------------------------------------
interface Opcion { id: string; es: string; en: string }
interface Pregunta {
  id: string; tipo: 'choice' | 'likert' | 'parrafo'
  es: string; en: string; opciones?: Opcion[]; requerida: boolean
}
interface Data {
  language: 'es' | 'en'; completed: boolean; employer_name: string | null
  graduates: string[]
  preguntas: Pregunta[]
  escala: Record<string, { es: string; en: string }>
}

const T = {
  es: {
    titulo: 'Encuesta de Satisfacción del Empleador', sub: 'Blackwell Global University',
    hola: (n: string | null) => `Estimado/a${n ? ` ${n}` : ''}:`,
    intro: (grads: string[]) => `Gracias por participar en la Encuesta de Satisfacción de Empleadores de Blackwell Global University. Sus respuestas sobre el desempeño de ${grads.length > 1 ? 'sus colaboradores graduados de nuestra universidad: ' + grads.join(', ') : `su colaborador/a ${grads[0] ?? ''}, graduado/a de nuestra universidad,`} nos ayudan a fortalecer la formación que brindamos. Le tomará menos de 5 minutos.`,
    escalaTit: 'Escala: 1 = No cumple las expectativas · 5 = Supera las expectativas',
    enviar: 'Enviar encuesta', enviando: 'Enviando…',
    gracias: '¡Gracias por completar la encuesta!', graciasSub: 'Sus respuestas fueron registradas. Su opinión fortalece la formación de nuestros graduados.',
    yaEnviada: 'Esta encuesta ya fue enviada anteriormente. ¡Gracias por su participación!',
    noEncontrada: 'Este enlace no es válido o expiró. Si cree que es un error, escríbanos a helpdesk@blackwell.university.',
    falta: 'Complete las preguntas marcadas antes de enviar.',
  },
  en: {
    titulo: 'Employer Satisfaction Survey', sub: 'Blackwell Global University',
    hola: (n: string | null) => `Dear${n ? ` ${n}` : ' employer'}:`,
    intro: (grads: string[]) => `Thank you for participating in the Blackwell Global University Employer Satisfaction Survey. Your feedback on the performance of ${grads.length > 1 ? 'your employees who graduated from our university: ' + grads.join(', ') : `your employee ${grads[0] ?? ''}, a graduate of our university,`} helps us strengthen the education we provide. It takes less than 5 minutes.`,
    escalaTit: 'Scale: 1 = Does not meet expectations · 5 = Exceeds expectations',
    enviar: 'Submit survey', enviando: 'Submitting…',
    gracias: 'Thank you for completing the survey!', graciasSub: 'Your answers were recorded. Your feedback strengthens the education of our graduates.',
    yaEnviada: 'This survey was already submitted. Thank you for participating!',
    noEncontrada: 'This link is not valid or has expired. If you believe this is an error, write to helpdesk@blackwell.university.',
    falta: 'Please complete the highlighted questions before submitting.',
  },
}

export function EmployerSurveyForm({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'enviada' | 'ya_enviada' | 'no_encontrada'>('cargando')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/form/employer-survey?token=${encodeURIComponent(token)}`).then(r => r.json()).then(d => {
      if (d.error) { setEstado('no_encontrada'); return }
      setData(d)
      setEstado(d.completed ? 'ya_enviada' : 'lista')
    }).catch(() => setEstado('no_encontrada'))
  }, [token])

  const lang: 'es' | 'en' = data?.language === 'en' ? 'en' : 'es'
  const t = T[lang]

  async function enviar() {
    setEnviando(true); setError(null)
    const r = await fetch('/api/form/employer-survey', {
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
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-90" />
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

  return (
    <Marco>
      <p className="text-[15px] text-gray-800 font-medium">{t.hola(data?.employer_name ?? null)}</p>
      <p className="text-sm text-gray-500 mt-1 mb-2 leading-relaxed">{t.intro(data?.graduates ?? [])}</p>
      <p className="text-[11px] text-gray-400 mb-6">{t.escalaTit}</p>

      <div className="space-y-5">
        {(data?.preguntas ?? []).map(p => {
          const v = answers[p.id]
          return (
            <div key={p.id}>
              <p className="text-sm text-gray-800 mb-1.5">
                {p[lang]}{p.requerida && <span className="text-red-400"> *</span>}
              </p>
              {p.tipo === 'likert' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setAnswers(a => ({ ...a, [p.id]: n }))}
                      title={data?.escala?.[String(n)]?.[lang] ?? String(n)}
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
              {p.tipo === 'parrafo' && (
                <textarea value={v ?? ''} onChange={e => setAnswers(a => ({ ...a, [p.id]: e.target.value }))} maxLength={2000} rows={3}
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
