'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'

export default function UpdatePasswordPage() {
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setHasSession(!!data.user)
      setChecking(false)
    })
    return () => { active = false }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError('No pudimos actualizar la contraseña. Es posible que el enlace haya expirado; solicita uno nuevo.')
      return
    }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <BrandLogo className="w-10 h-10" />
          <div>
            <p className="text-lg font-bold text-white">BGU ERP</p>
            <p className="text-xs text-gray-400">Sistema Empresarial</p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden p-8">
          {checking ? (
            <div className="py-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-600/20 border border-green-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Contraseña actualizada</p>
                <p className="text-sm text-gray-400 leading-relaxed">Ya puedes ingresar con tu nueva contraseña.</p>
              </div>
              <Link href="/desk" className="block bg-blue-600 hover:bg-blue-700 text-white text-center py-2.5 rounded-lg text-sm font-medium transition-colors">
                Ir al sistema →
              </Link>
            </div>
          ) : !hasSession ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-600/20 border border-amber-500/30 flex items-center justify-center mx-auto">
                <KeyRound className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Enlace inválido o expirado</p>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Este enlace para restablecer la contraseña ya no es válido. Solicita uno nuevo desde el inicio de sesión.
                </p>
              </div>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-white font-semibold mb-1">Cambiar contraseña</p>
                <p className="text-sm text-gray-400 mb-4">Define tu nueva contraseña de acceso.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Nueva contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Confirmar contraseña</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Repite la contraseña"
                  className="w-full px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {error && (
                <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </button>
              <Link href="/desk" className="block text-center text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Cancelar
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
