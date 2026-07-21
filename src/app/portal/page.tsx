'use client'

import { useState } from 'react'
import { Loader2, GraduationCap, Mail, ArrowRight } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'

// Entrada pública del Portal del Estudiante (heredera del front de Activa):
// panel héroe + tarjeta de bienvenida, bilingüe. El acceso es por ENLACE
// MÁGICO al correo (sin contraseña ni captcha): más simple y más seguro.
type Lang = 'es' | 'en'

const T = {
  es: {
    heroTitle: 'Tu camino hacia el éxito académico',
    heroText: 'Accede a tus cursos, consulta tus calificaciones y lleva un seguimiento de tu trayectoria académica.',
    welcome: 'Bienvenido de nuevo,',
    student: 'Estudiante',
    intro: ['Ingresa tu correo para ver tus ', 'cronogramas', ', ', 'calificaciones', ', estado de cuenta y documentos.'],
    emailLabel: 'Correo institucional o personal',
    emailPlaceholder: 'nombre.apellido@blackwell.pro',
    note: 'Te enviaremos un enlace de acceso seguro a tu correo — sin contraseñas que recordar.',
    cta: 'Acceder al Portal del Estudiante',
    sending: 'Enviando enlace…',
    sentTitle: 'Revisa tu correo 📬',
    sentText: (mail: string) => `Enviamos tu enlace de acceso a ${mail}. Ábrelo para entrar al portal — es válido por 1 hora.`,
    otherEmail: 'Usar otro correo',
    errNotStudent: 'Este correo no está registrado como estudiante. Verifica tu email o escribe a soporte@blackwell.university.',
    errUseInstitutional: (inst: string) => `Tu acceso al portal es con tu correo institucional: ${inst}`,
    errGeneric: 'No pudimos enviar el enlace. Intenta de nuevo en unos minutos.',
    staff: '¿Eres parte del equipo?',
    staffLink: 'Ingresa por el acceso de staff',
  },
  en: {
    heroTitle: 'Your path to academic success',
    heroText: 'Access your courses, check your grades and keep track of your academic journey.',
    welcome: 'Welcome back,',
    student: 'Student',
    intro: ['Enter your email to see your ', 'schedules', ', ', 'grades', ', account statement and documents.'],
    emailLabel: 'Institutional or personal email',
    emailPlaceholder: 'name.lastname@blackwell.pro',
    note: 'We will send a secure sign-in link to your email — no passwords to remember.',
    cta: 'Access the Student Portal',
    sending: 'Sending link…',
    sentTitle: 'Check your inbox 📬',
    sentText: (mail: string) => `We sent your sign-in link to ${mail}. Open it to enter the portal — valid for 1 hour.`,
    otherEmail: 'Use another email',
    errNotStudent: 'This email is not registered as a student. Check your email or write to soporte@blackwell.university.',
    errUseInstitutional: (inst: string) => `Your portal access is through your institutional email: ${inst}`,
    errGeneric: 'We could not send the link. Please try again in a few minutes.',
    staff: 'Are you a staff member?',
    staffLink: 'Use the staff sign-in',
  },
}

export default function StudentPortalEntry() {
  const [lang, setLang] = useState<Lang>('es')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = T[lang]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/student/magic-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string; institutional?: string }
      if (d.error === 'not_student') setError(t.errNotStudent)
      else if (d.error === 'use_institutional' && d.institutional) setError(t.errUseInstitutional(d.institutional))
      else setError(t.errGeneric)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Panel héroe (izquierda) */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden bg-gradient-to-br from-slate-500 via-slate-400 to-slate-600">
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="relative m-12 max-w-lg rounded-2xl bg-white/30 backdrop-blur-sm border border-white/40 shadow-xl p-12">
          <h1 className="text-5xl font-bold text-slate-800 leading-tight tracking-tight">
            {t.heroTitle} <GraduationCap className="inline w-11 h-11 -mt-2" />
          </h1>
          <p className="mt-6 text-lg text-slate-700 leading-relaxed">{t.heroText}</p>
        </div>
      </div>

      {/* Panel de acceso (derecha) */}
      <div className="flex-1 flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="w-9 h-9" />
            <div>
              <p className="text-sm font-bold text-gray-900">Blackwell Global University</p>
              <p className="text-[11px] text-gray-500">{lang === 'es' ? 'Portal del Estudiante' : 'Student Portal'}</p>
            </div>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {(['es', 'en'] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 ${lang === l ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {l === 'es' ? '🇪🇸 Es' : '🇺🇸 En'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">
            {!sent ? (
              <>
                <GraduationCap className="w-14 h-14 text-gray-900 mb-5" strokeWidth={1.3} />
                <h2 className="text-3xl font-bold text-gray-900 leading-snug">
                  {t.welcome}<br />{t.student} 👋
                </h2>
                <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">
                  {t.intro[0]}<b className="text-gray-700">{t.intro[1]}</b>{t.intro[2]}<b className="text-gray-700">{t.intro[3]}</b>{t.intro[4]}
                </p>

                <form onSubmit={submit} className="mt-8 space-y-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5">{t.emailLabel}</label>
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder={t.emailPlaceholder}
                      className="w-full px-4 py-3 text-sm bg-blue-50/50 border border-blue-100 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed flex items-start gap-1.5">
                    <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {t.note}
                  </p>
                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                  )}
                  <button type="submit" disabled={loading || !email.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-50">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading ? t.sending : t.cta}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{t.sentTitle}</h2>
                <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">{t.sentText(email)}</p>
                <button onClick={() => { setSent(false); setEmail('') }}
                  className="mt-6 text-sm font-medium text-blue-600 hover:text-blue-800">
                  {t.otherEmail}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          {t.staff}{' '}
          <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium underline underline-offset-2">{t.staffLink}</Link>
        </p>
      </div>
    </div>
  )
}
