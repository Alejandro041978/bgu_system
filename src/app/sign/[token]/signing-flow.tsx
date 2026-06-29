'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Mail, ShieldCheck, AlertCircle, Clock } from 'lucide-react'

type Contract = {
  id: string
  token: string
  signer_name: string
  signer_email: string
  rendered_body: string
  status: 'pending' | 'signed' | 'expired' | 'cancelled'
  token_expires_at: string
  signed_at: string | null
}

type Step = 'read' | 'otp_sent' | 'signed'

export function SigningFlow({ contract, expired }: { contract: Contract; expired: boolean }) {
  const [step, setStep] = useState<Step>(contract.status === 'signed' ? 'signed' : 'read')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)

  async function sendOtp() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/sign/${contract.token}/otp`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error)
      setStep('otp_sent')
    } catch (err) {
      setError(String(err))
    } finally {
      setSending(false)
    }
  }

  async function confirmSign() {
    if (code.length !== 6) return
    setConfirming(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/sign/${contract.token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error)
      setStep('signed')
    } catch (err) {
      setError(String(err))
    } finally {
      setConfirming(false)
    }
  }

  if (expired && step !== 'signed') {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
        <Clock className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Enlace expirado</h2>
        <p className="text-sm text-gray-500">Este enlace de firma ya no es válido. Contacta a quien te lo envió para que genere uno nuevo.</p>
      </div>
    )
  }

  if (step === 'signed') {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-9 h-9 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">¡Documento firmado!</h2>
        <p className="text-sm text-gray-600 mb-1">
          Gracias, <strong>{contract.signer_name}</strong>. Tu firma ha quedado registrada.
        </p>
        <p className="text-xs text-gray-400">
          Recibirás una copia de confirmación en <strong>{contract.signer_email}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Contrato */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Para: {contract.signer_name}</p>
            <p className="text-xs text-gray-500">{contract.signer_email}</p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
            Pendiente de firma
          </span>
        </div>
        <div className="px-8 py-6 max-h-[60vh] overflow-y-auto">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
            {contract.rendered_body}
          </pre>
        </div>
      </div>

      {/* Acciones */}
      {step === 'read' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              He leído y acepto el contenido del presente documento y confirmo que los datos son correctos.
            </span>
          </label>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={sendOtp}
            disabled={!agreed || sending}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {sending ? 'Enviando código...' : 'Firmar · Enviar código de verificación'}
          </button>
          <p className="text-xs text-center text-gray-400">
            Se enviará un código de 6 dígitos a <strong>{contract.signer_email}</strong>
          </p>
        </div>
      )}

      {step === 'otp_sent' && (
        <div className="bg-white rounded-xl border border-blue-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Ingresa tu código de verificación</p>
              <p className="text-xs text-gray-500">Revisa tu bandeja de entrada en <strong>{contract.signer_email}</strong></p>
            </div>
          </div>

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full text-center text-3xl font-mono tracking-[0.5em] border border-gray-300 rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={confirmSign}
            disabled={code.length !== 6 || confirming}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {confirming ? 'Verificando...' : 'Confirmar y firmar'}
          </button>

          <button
            onClick={sendOtp}
            disabled={sending}
            className="w-full text-sm text-gray-500 hover:text-blue-600 underline"
          >
            {sending ? 'Reenviando...' : 'Reenviar código'}
          </button>
        </div>
      )}
    </div>
  )
}
