'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ShieldCheck, Clock, AlertTriangle, CheckCircle2, XCircle, MessageCircle, CalendarClock } from 'lucide-react'

interface Status {
  overdue: number; is_partner: boolean
  active_exception: { expires_at: string; days: number; source: string } | null
  used: number; max: number; can_request: boolean
  recientes: { days: number; decision: string; decision_reason: string | null; created_at: string }[]
}
interface Result { decision: 'aceptada' | 'rechazada'; reason: string; expires_at: string | null; sofia?: boolean }

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export function MoodleException() {
  const [st, setSt] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<3 | 5>(3)
  const [justif, setJustif] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/student/moodle-exception').then(r => r.json()).catch(() => null)
    if (d && !d.error) setSt(d); else setError(d?.error ?? 'No se pudo cargar')
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (justif.trim().length < 15) { setError('Cuéntanos con un poco más de detalle (mínimo 15 caracteres).'); return }
    setSending(true); setError(null); setResult(null)
    const d = await fetch('/api/student/moodle-exception', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days, justification: justif.trim() }),
    }).then(r => r.json())
    setSending(false)
    if (d.error) { setError(d.error); return }
    setResult(d)
    load()
  }

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  const sofiaLink = (
    <Link href="/student/sofia" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 mt-2">
      <MessageCircle className="w-4 h-4" /> Escríbele a Sofía
    </Link>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Excepción Temporal de Deuda</h1>
        <p className="text-sm text-gray-500 mt-1">Si tienes una deuda vencida, puedes solicitar 3 o 5 días de gracia para recuperar el acceso al aula virtual, comprometiéndote a pagar dentro de ese plazo.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Sin deuda */}
      {st && st.overdue <= 0.005 && !st.active_exception && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <ShieldCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-sm text-green-800 font-medium">Estás al día con tus pagos.</p>
          <p className="text-xs text-green-700 mt-1">No necesitas una excepción. ¡Gracias!</p>
        </div>
      )}

      {/* Campus aliado */}
      {st && st.is_partner && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-600">
          Tu programa es de un campus aliado; esta excepción no aplica a tu caso.
        </div>
      )}

      {/* Excepción vigente */}
      {st && st.active_exception && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-indigo-800"><CalendarClock className="w-4 h-4" /> Tienes una excepción vigente</p>
          <p className="text-sm text-indigo-700 mt-1">Tu acceso está habilitado hasta el <b>{fdate(st.active_exception.expires_at)}</b>. Tu compromiso es pagar antes de esa fecha.</p>
        </div>
      )}

      {/* Resultado de la solicitud recién enviada */}
      {result && (
        <div className={`rounded-xl p-5 border ${result.decision === 'aceptada' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`flex items-center gap-2 text-sm font-semibold ${result.decision === 'aceptada' ? 'text-green-800' : 'text-red-800'}`}>
            {result.decision === 'aceptada' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {result.decision === 'aceptada' ? 'Excepción concedida' : 'Solicitud no aprobada'}
          </p>
          <p className={`text-sm mt-1 ${result.decision === 'aceptada' ? 'text-green-700' : 'text-red-700'}`}>{result.reason}</p>
          {result.decision === 'aceptada' && result.expires_at && <p className="text-xs text-green-700 mt-1">Acceso habilitado hasta el <b>{fdate(result.expires_at)}</b>.</p>}
          {result.decision === 'rechazada' && sofiaLink}
        </div>
      )}

      {/* Formulario */}
      {st && st.can_request && !result && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4" /> Tienes una deuda vencida de <b>{money(st.overdue)}</b>.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Días de gracia (compromiso de pago)</label>
            <div className="flex gap-2">
              {[3, 5].map(d => (
                <button key={d} onClick={() => setDays(d as 3 | 5)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {d} días
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Te comprometes a pagar dentro de {days} días.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Justificación</label>
            <textarea value={justif} onChange={e => setJustif(e.target.value)} rows={4} maxLength={800}
              placeholder="Explícanos por qué no estás al día en tus pagos y cómo regularizarás dentro del plazo…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <p className="text-[11px] text-gray-400 mt-1">{justif.trim().length}/800 · Se evaluará para decidir tu solicitud.</p>
          </div>
          <p className="text-[11px] text-gray-400">Te quedan {st.max - st.used} de {st.max} solicitudes este semestre.</p>
          <button onClick={submit} disabled={sending || justif.trim().length < 15}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium">
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Evaluando tu solicitud…</> : 'Solicitar excepción'}
          </button>
        </div>
      )}

      {/* Límite alcanzado */}
      {st && st.overdue > 0.005 && !st.is_partner && !st.active_exception && !st.can_request && st.used >= st.max && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          <p className="flex items-center gap-2 font-medium"><Clock className="w-4 h-4" /> Alcanzaste el máximo de {st.max} excepciones este semestre.</p>
          <p className="mt-1">Para coordinar una solución de pago, contáctate con Sofía.</p>
          {sofiaLink}
        </div>
      )}

      {/* Historial */}
      {st && st.recientes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">Tus solicitudes recientes</p>
          <ul className="divide-y divide-gray-50">
            {st.recientes.map((r, i) => (
              <li key={i} className="px-4 py-2.5 text-xs flex items-start gap-2">
                <span className={`mt-0.5 ${r.decision === 'aceptada' ? 'text-green-600' : 'text-red-500'}`}>
                  {r.decision === 'aceptada' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                </span>
                <span className="flex-1">
                  <span className="text-gray-700">{r.days} días · {r.decision}</span>
                  <span className="block text-gray-400">{fdate(r.created_at)}{r.decision_reason ? ` · ${r.decision_reason}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
