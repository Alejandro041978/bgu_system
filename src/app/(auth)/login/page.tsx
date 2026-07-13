'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, KeyRound, Mail } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'

type Mode = 'staff' | 'student'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('staff')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setMagicSent(false)
    setResetSent(false)
    setEmail('')
    setPassword('')
  }

  async function handleForgotPassword() {
    setError(null)
    if (!email) {
      setError('Escribe tu correo institucional arriba y vuelve a pulsar el enlace.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    })
    setLoading(false)
    if (error) {
      setError('No pudimos enviar el correo de recuperación. Verifica tu email e intenta de nuevo.')
      return
    }
    setResetSent(true)
  }

  async function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setLoading(false)
      return
    }
    window.location.href = '/desk'
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Genera y envía el enlace por Resend desde el servidor (no por Supabase).
    const res = await fetch('/api/student/magic-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (d.error === 'not_student') setError('Este correo no está registrado como estudiante. Verifica tu email.')
      else setError('No pudimos enviar el enlace. Intenta de nuevo en unos minutos.')
      return
    }
    setMagicSent(true)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <BrandLogo className="w-10 h-10" />
          <div>
            <p className="text-lg font-bold text-white">BGU ERP</p>
            <p className="text-xs text-gray-400">Sistema Empresarial</p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-gray-800">
            <button
              onClick={() => switchMode('staff')}
              className={`flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                mode === 'staff'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Staff
            </button>
            <button
              onClick={() => switchMode('student')}
              className={`flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                mode === 'student'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Mail className="w-4 h-4" />
              Estudiante
            </button>
          </div>

          <div className="p-8">
            {/* STAFF — reset link sent */}
            {mode === 'staff' && resetSent && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto">
                  <Mail className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-semibold mb-1">Revisa tu correo</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Enviamos un enlace para restablecer tu contraseña a <span className="text-white">{email}</span>.<br />
                    Ábrelo y define tu nueva contraseña.
                  </p>
                </div>
                <button
                  onClick={() => setResetSent(false)}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Volver
                </button>
              </div>
            )}

            {/* STAFF */}
            {mode === 'staff' && !resetSent && (
              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Email institucional</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="correo@blackwell.university"
                    className="w-full px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="w-full text-center text-sm text-gray-500 hover:text-blue-400 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </form>
            )}

            {/* STUDENT */}
            {mode === 'student' && !magicSent && (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <p className="text-sm text-gray-400 leading-relaxed">
                  Ingresa tu correo institucional y te enviaremos un enlace de acceso directo.
                </p>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Correo institucional</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="correo@neumann.education"
                    className="w-full px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
                </button>
              </form>
            )}

            {/* STUDENT — magic link sent */}
            {mode === 'student' && magicSent && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto">
                  <Mail className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-semibold mb-1">Revisa tu correo</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Enviamos un enlace de acceso a <span className="text-white">{email}</span>.<br />
                    Haz click en el enlace para ingresar. Válido por 1 hora.
                  </p>
                </div>
                <button
                  onClick={() => { setMagicSent(false); setEmail('') }}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Usar otro correo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
