'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, HelpCircle, AlertTriangle, Send, Monitor } from 'lucide-react'

interface Curso { code: string | null; name: string | null; aula_id: number | null; aula: string | null; enrolled: boolean | null }
interface Programa { program: string; group: string; collection: string | null; courses: Curso[] }
interface Data {
  account: { exists: boolean; suspended: boolean | null; lastaccess: number | null }
  programs: Programa[]
  extras: { id: number; name: string }[]
  moodle_ok: boolean
}

export function CampusCheck() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [caso, setCaso] = useState<{ n: number | null; already: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/student/campus-check').then(r => r.json())
      .then(d => d.error ? setError(d.error) : setData(d))
      .catch(() => setError('No se pudo verificar. Intenta de nuevo en unos minutos.'))
  }, [])

  async function reportar() {
    if (!confirm('Se enviará un reporte a la universidad con el detalle de tus accesos para que lo revisen. ¿Confirmas?')) return
    setSending(true)
    const res = await fetch('/api/student/campus-check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    })
    const d = await res.json()
    setSending(false)
    if (!res.ok) { alert(d.error ?? 'No se pudo enviar el reporte'); return }
    setCaso({ n: d.case_number ?? null, already: !!d.already })
  }

  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
  if (!data) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  const cuenta = !data.account.exists
    ? { label: 'Sin cuenta en el campus', cls: 'bg-red-50 border-red-200 text-red-700', icon: <XCircle className="w-5 h-5" /> }
    : data.account.suspended
      ? { label: 'Cuenta suspendida', cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertTriangle className="w-5 h-5" /> }
      : data.account.suspended === false
        ? { label: 'Cuenta activa: puedes ingresar al campus', cls: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle2 className="w-5 h-5" /> }
        : { label: 'Tienes cuenta; el estado no se pudo comprobar ahora', cls: 'bg-gray-50 border-gray-200 text-gray-600', icon: <HelpCircle className="w-5 h-5" /> }

  const Badge = ({ c }: { c: Curso }) => c.aula_id == null
    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sin aula asignada</span>
    : c.enrolled === true
      ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">Con acceso</span>
      : c.enrolled === false
        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Sin acceso</span>
        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sin comprobar</span>

  return (
    <div className="space-y-5">
      {/* Estado de la cuenta */}
      <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${cuenta.cls}`}>
        {cuenta.icon}
        <div>
          <p className="text-sm font-medium">{cuenta.label}</p>
          {data.account.lastaccess ? (
            <p className="text-[11px] opacity-70">Último ingreso: {new Date(data.account.lastaccess * 1000).toLocaleString('es-PE')}</p>
          ) : null}
        </div>
      </div>

      {!data.moodle_ok && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          El campus no respondió durante la verificación: la columna de acceso puede aparecer &quot;sin comprobar&quot;. Vuelve a intentar en unos minutos.
        </p>
      )}

      {/* Asignaturas a las que debería tener acceso */}
      {data.programs.length === 0 && (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-6 text-center">
          No tienes una ruta de asignaturas activa en este momento. Si crees que deberías estar cursando, repórtalo abajo.
        </p>
      )}
      {data.programs.map(p => (
        <div key={p.group} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Monitor className="w-4 h-4 text-gray-400" /> {p.program}</p>
            <p className="text-[11px] text-gray-400">Estas son las asignaturas de tu etapa actual y el aula que te corresponde en el campus.</p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {p.courses.map(c => (
                <tr key={`${c.code}-${c.aula_id}`}>
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{c.name}</p>
                    <p className="text-[11px] text-gray-400">{c.code}{c.aula ? ` · aula ${c.aula}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right"><Badge c={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {data.extras.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">También apareces matriculado en: {data.extras.map(x => x.name).join(', ')}.
            Puede ser normal (nivelaciones, aulas de recursos); si no lo reconoces, inclúyelo en tu reporte.</p>
        </div>
      )}

      {/* Reportar inconsistencia */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-blue-900">¿Lo que ves en el campus no coincide con esta lista?</p>
        <p className="text-xs text-blue-800/70">
          Si te falta un aula, ves una que no te corresponde o no puedes ingresar, genera el reporte:
          la universidad recibirá esta verificación completa y revisará tu caso.
        </p>
        {caso ? (
          <p className="text-sm bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-900">
            {caso.already
              ? <>Ya tienes un caso abierto por este tema{caso.n ? <> (<b>Caso #{caso.n}</b>)</> : null}. La universidad lo está revisando.</>
              : <>Reporte enviado{caso.n ? <>: <b>Caso #{caso.n}</b></> : null}. Te responderemos a tu correo.</>}
          </p>
        ) : (
          <>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000}
              placeholder="Cuéntanos qué no coincide (opcional): qué aula te falta, cuál te sobra, qué error ves…"
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button onClick={reportar} disabled={sending}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Reportar inconsistencia
            </button>
          </>
        )}
      </div>
    </div>
  )
}
