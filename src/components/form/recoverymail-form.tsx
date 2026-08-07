'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, Mail, AlertCircle, CheckCircle2 } from 'lucide-react'

type Paso = 'documento' | 'codigo' | 'nacimiento' | 'final'

export function RecoverymailForm() {
  const [paso, setPaso] = useState<Paso>('documento')
  const [documento, setDocumento] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nacimiento, setNacimiento] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [final, setFinal] = useState<{ outcome: string; mensaje: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function llamar(body: Record<string, unknown>) {
    setCargando(true); setError(null)
    const r = await fetch('/api/form/recoverymail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: documento, ...body }),
    }).then(x => x.json()).catch(() => ({ error: 'No hay conexión. Inténtalo de nuevo.' }))
    setCargando(false)
    return r as { ok?: boolean; error?: string; hint?: string; need_birth_date?: boolean; outcome?: string; mensaje?: string }
  }

  async function pedirCodigo() {
    const d = await llamar({ action: 'start' })
    if (d.error) { setError(d.error); return }
    // La respuesta es la misma exista o no el documento: nunca se dice si
    // alguien es estudiante. El paso avanza igual.
    setHint(d.hint ?? null)
    setCodigo(''); setPaso('codigo')
  }

  async function verificar() {
    const d = await llamar({ action: 'verify', code: codigo, birth_date: nacimiento || undefined })
    if (d.error) { setError(d.error); return }
    if (d.need_birth_date) { setPaso('nacimiento'); return }
    setFinal({ outcome: d.outcome ?? '', mensaje: d.mensaje ?? '' })
    setPaso('final')
  }

  const caja = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const boton = 'w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg py-2.5 inline-flex items-center justify-center gap-2'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {paso === 'documento' && (
        <>
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              Escribe tu número de documento. Te enviaremos un código al correo personal
              registrado en tu ficha — no a tu correo institucional, que es al que no puedes entrar.
            </p>
          </div>
          <input value={documento} onChange={e => setDocumento(e.target.value)} inputMode="text"
            onKeyDown={e => { if (e.key === 'Enter' && documento.trim().length >= 5) pedirCodigo() }}
            placeholder="Número de documento" className={caja} autoFocus />
          <button onClick={pedirCodigo} disabled={cargando || documento.trim().length < 5} className={boton}>
            {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Enviar código
          </button>
        </>
      )}

      {paso === 'codigo' && (
        <>
          <div className="flex items-start gap-2.5">
            <Mail className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              Si el documento corresponde a un estudiante con correo institucional, enviamos un
              código {hint ? <>a <strong className="text-gray-900">{hint}</strong></> : 'al canal registrado en su ficha'}.
              Vence en 10 minutos.
            </p>
          </div>
          <input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter' && codigo.length === 6) verificar() }}
            placeholder="000000" inputMode="numeric"
            className={`${caja} text-center text-2xl tracking-[0.5em] font-mono`} autoFocus />
          <button onClick={verificar} disabled={cargando || codigo.length !== 6} className={boton}>
            {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Verificar
          </button>
          <button onClick={() => { setPaso('documento'); setError(null) }}
            className="w-full text-xs text-gray-400 hover:text-gray-600">Usar otro documento</button>
        </>
      )}

      {paso === 'nacimiento' && (
        <>
          <p className="text-sm text-gray-600">
            Un dato más para confirmar que eres tú: tu fecha de nacimiento.
          </p>
          <input type="date" value={nacimiento} onChange={e => setNacimiento(e.target.value)} className={caja} autoFocus />
          <button onClick={verificar} disabled={cargando || !nacimiento} className={boton}>
            {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar
          </button>
        </>
      )}

      {paso === 'final' && final && (
        <div className="text-center py-2 space-y-3">
          {final.outcome === 'reset' ? (
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
          ) : (
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          )}
          <p className="text-sm text-gray-700 leading-relaxed">{final.mensaje}</p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
