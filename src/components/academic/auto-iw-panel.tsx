'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Power, UserX } from 'lucide-react'

// IW automático por abandono (18/09/2026). Este panel REFLEJA lo que el proceso
// nocturno hará —o haría, con el interruptor apagado—. La única acción es el
// interruptor: cada IW que nace aquí entra a la cola del Gestor, donde una
// persona revisa y aprueba su ejecución.
type Estado = 'cumple' | 'esperando_preaviso' | 'en_preaviso' | 'falta_camila' | 'revision_manual'
interface Candidato {
  student_id: string; estudiante: string; documento: string | null; programa: string
  dias_sin_conexion: number; ultima_conexion: string | null; nunca_conecto: boolean
  deuda_vencida: number
  camila: { contactos: number; ultimo_contacto: string | null; respondio: boolean; resultado: string | null }
  preaviso_enviado: string | null; estado: Estado; motivo: string
}
interface Data {
  settings: { enabled: boolean; daily_cap: number; migrado: boolean }
  reglas: { dias_iw: number; dias_preaviso: number }
  candidatos: Candidato[]
  resumen: Record<Estado, number>
  excluidos: Record<string, number>
}

const ESTADOS: { key: Estado; titulo: string; ayuda: string; cls: string }[] = [
  { key: 'cumple', titulo: 'Cumplen hoy', ayuda: 'Reúnen las cuatro condiciones y su preaviso ya cumplió 7 días: esta noche pasan a IW.', cls: 'text-red-700' },
  { key: 'esperando_preaviso', titulo: 'Esperando preaviso', ayuda: 'Cumplen todo, pero el preaviso aún no se envió o no tiene 7 días.', cls: 'text-orange-700' },
  { key: 'en_preaviso', titulo: 'Día 28 a 34', ayuda: 'Ya les toca (o ya recibieron) el preaviso; el plazo se cumple al día 35.', cls: 'text-amber-700' },
  { key: 'falta_camila', titulo: 'Falta Camila', ayuda: '35+ días y deuda vencida, pero Camila no les ha escrito lo suficiente. No hay IW sin contacto previo.', cls: 'text-blue-700' },
  { key: 'revision_manual', titulo: 'Revisión manual', ayuda: 'Varias matrículas activas, respondieron a Camila, tienen compromiso o pidieron no ser contactados.', cls: 'text-gray-700' },
]
const f = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function AutoIwPanel() {
  const [d, setD] = useState<Data | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [ver, setVer] = useState<Estado>('cumple')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const cargar = () => fetch('/api/academic/iw-reentry/auto').then(r => r.json()).then(x => {
    if (x.error) { setErr(x.error); return }
    setD(x)
    const primero = ESTADOS.find(e => (x.resumen?.[e.key] ?? 0) > 0)
    if (primero) setVer(primero.key)
  }).catch(() => setErr('No se pudo cargar'))
  useEffect(() => { cargar() }, [])

  async function alternar() {
    if (!d) return
    const encender = !d.settings.enabled
    if (!confirm(encender
      ? `¿ENCENDER el IW automático?\n\nDesde esta noche el proceso enviará preavisos y creará los IW de quienes cumplan (máximo ${d.settings.daily_cap} por noche). Cada IW queda en este Gestor para su revisión y aprobación.`
      : '¿Apagar el IW automático? Vuelve al modo ensayo: se sigue calculando la lista, pero no se envían preavisos ni se crean IW.')) return
    setBusy(true); setErr(null)
    const r = await fetch('/api/academic/iw-reentry/auto', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: encender }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? 'No se pudo guardar'); return }
    cargar()
  }

  const lista = (d?.candidatos ?? []).filter(c => c.estado === ver)
  const total = d ? Object.values(d.resumen).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50">
        {abierto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <UserX className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">IW automático por abandono</span>
        {d && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${d.settings.enabled ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            {d.settings.enabled ? 'encendido' : 'apagado · modo ensayo'}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {!d ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : `${d.resumen.cumple} cumplen hoy · ${total} en seguimiento`}
        </span>
      </button>

      {abierto && d && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <p className="text-xs text-gray-500 flex-1 min-w-72">
              Pasa a IW el estudiante con matrícula activa y <b>sin LOA</b> que lleva <b>{d.reglas.dias_iw} días sin conectarse</b> al campus ni al ERP,
              tiene <b>deuda vencida</b> y <b>no le contestó a Camila</b> (2 mensajes o más, el último hace 7 días). El día {d.reglas.dias_preaviso} recibe
              un preaviso. El IW nace vigente y queda en este Gestor para <b>revisión y aprobación</b> de su ejecución.
              {!d.settings.enabled && <> Apagado, el proceso <b>solo calcula esta lista</b>: no envía preavisos ni crea IW.</>}
            </p>
            <button onClick={alternar} disabled={busy || !d.settings.migrado}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border disabled:opacity-40 ${d.settings.enabled ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'border-green-600 bg-green-600 text-white hover:bg-green-700'}`}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
              {d.settings.enabled ? 'Apagar' : 'Encender'}
            </button>
          </div>
          {!d.settings.migrado && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Falta correr <span className="font-mono">supabase/auto_iw.sql</span> para poder encenderlo. Mientras tanto funciona en modo ensayo.</p>}
          {err && <p className="text-xs text-red-700">{err}</p>}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {ESTADOS.map(e => (
              <button key={e.key} onClick={() => setVer(e.key)} title={e.ayuda}
                className={`text-left rounded-lg border px-3 py-2 ${ver === e.key ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="text-[11px] text-gray-500">{e.titulo}</p>
                <p className={`text-xl font-bold tabular-nums ${e.cls}`}>{d.resumen[e.key] ?? 0}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">{ESTADOS.find(e => e.key === ver)?.ayuda}</p>

          {lista.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-[10.5px] uppercase text-gray-400 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Programa</th>
                    <th className="px-3 py-2 font-medium text-right">Sin conexión</th>
                    <th className="px-3 py-2 font-medium text-right">Deuda vencida</th>
                    <th className="px-3 py-2 font-medium">Camila</th>
                    <th className="px-3 py-2 font-medium">Preaviso</th>
                    <th className="px-3 py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lista.map(c => (
                    <tr key={c.student_id} className="align-top">
                      <td className="px-3 py-2 text-gray-800">{c.estudiante}<span className="block text-[10.5px] text-gray-400">{c.documento ?? ''}</span></td>
                      <td className="px-3 py-2 text-gray-500">{c.programa}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{c.dias_sin_conexion} d<span className="block text-[10.5px] text-gray-400">{c.nunca_conecto ? 'nunca se conectó' : f(c.ultima_conexion)}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">${c.deuda_vencida.toFixed(2)}</td>
                      <td className="px-3 py-2 text-gray-500">{c.camila.contactos} mensaje(s){c.camila.ultimo_contacto ? <span className="block text-[10.5px] text-gray-400">último {f(c.camila.ultimo_contacto)}</span> : null}</td>
                      <td className="px-3 py-2 text-gray-500">{f(c.preaviso_enviado)}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-xs">{c.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-gray-400">Nadie en este grupo.</p>}

          {Object.keys(d.excluidos).length > 0 && (
            <p className="text-[11px] text-gray-400">
              Fuera de la regla (28+ días sin conexión pero no aplican): {Object.entries(d.excluidos).map(([k, n]) => `${n} ${k}`).join(' · ')}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
