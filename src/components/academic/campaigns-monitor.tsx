'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, Users, Send, MessageSquare, Target } from 'lucide-react'

interface Campana {
  key: string; nombre: string; activa: boolean; prioridad: number
  cupo_diario: number; enviados_hoy: number
  plantilla: string; tiene_plantilla: boolean; bot: string
  elegibles: number; en_cola: number; contactados: number; respondieron: number
  exito: number; exito_label: string; tasa_respuesta: number; tasa_exito: number
  bloqueo: string | null; legacy?: boolean
}
interface Data {
  campanas: Campana[]
  totales: { elegibles: number; contactados: number; exito: number; activas: number; bloqueadas: number }
  optouts: number; en_cooldown: number
  periodo?: { dias: number; desde: string | null }
}

// Monitor de TODAS las campañas de Camila. El tablero histórico solo medía
// retención; desde 2026-07-29 Camila atiende varias (titulación, cobranza,
// cashpay, ausente, iw, loa) y cada una se mide con SU propio resultado.
export function CampaignsMonitor() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Elegibles y cola son siempre la foto de hoy; contactados, respuestas y
  // resultado son acumulados, y sin acotarlos un mes bueno y uno malo se
  // mezclan hasta que la campaña parece siempre igual.
  const [dias, setDias] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/campaigns/metrics?dias=${dias}`).then(r => r.json()).then(j => {
      if (j.error) setError(j.error); else { setD(j); setError(null) }
      setLoading(false)
    }).catch(() => { setError('No se pudo cargar'); setLoading(false) })
  }, [dias])

  const RANGOS: { v: number; label: string }[] = [
    { v: 1, label: 'Hoy' }, { v: 7, label: '7 días' }, { v: 30, label: '30 días' }, { v: 0, label: 'Todo' },
  ]
  const selector = (
    <div className="flex items-center gap-1 mb-4">
      <span className="text-xs text-gray-400 mr-1">Resultados de:</span>
      {RANGOS.map(r => (
        <button key={r.v} onClick={() => setDias(r.v)}
          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${dias === r.v
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {r.label}
        </button>
      ))}
    </div>
  )

  // El selector se pinta también mientras carga: si desaparece al cambiar de
  // rango, parece que el clic no hizo nada.
  if (loading) return <div>{selector}<div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /><p className="text-xs text-gray-400 mt-2">Resolviendo elegibilidad de todas las campañas…</p></div></div>
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
  if (!d) return null

  const barra = (n: number, total: number, cls: string) => (
    <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
      <div className={`h-5 rounded-full ${cls}`} style={{ width: `${total > 0 ? Math.max(2, (n / total) * 100) : 0}%` }} />
      <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-semibold text-gray-700">{n}</span>
    </div>
  )

  return (
    <div className="space-y-5">
      {selector}
      {/* Resumen global */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { l: 'Campañas activas', n: d.totales.activas, c: 'text-green-600', I: Target },
          { l: 'Bloqueadas', n: d.totales.bloqueadas, c: 'text-amber-600', I: AlertTriangle },
          { l: 'Elegibles', n: d.totales.elegibles, c: 'text-blue-600', I: Users },
          { l: 'Contactados', n: d.totales.contactados, c: 'text-indigo-600', I: Send },
          { l: 'Con resultado', n: d.totales.exito, c: 'text-emerald-600', I: CheckCircle2 },
        ]).map(({ l, n, c, I }) => (
          <div key={l} className="bg-white border border-gray-200 rounded-xl p-3.5">
            <p className={`text-2xl font-bold tabular-nums ${c}`}>{n}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1"><I className="w-3 h-3" />{l}</p>
          </div>
        ))}
      </div>

      {/* Una tarjeta por campaña */}
      <div className="space-y-3">
        {d.campanas.map(c => (
          <div key={c.key} className={`bg-white border rounded-xl overflow-hidden ${c.legacy ? 'border-amber-200' : c.activa && !c.bloqueo ? 'border-green-200' : 'border-gray-200'}`}>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full ${c.activa && !c.bloqueo ? 'bg-green-500' : c.activa ? 'bg-amber-500' : 'bg-gray-300'}`} />
              <p className="text-sm font-semibold text-gray-800">{c.nombre}</p>
              <span className="text-[10.5px] text-gray-400 font-mono">{c.key}</span>
              {c.legacy && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">OLD · modelo anterior</span>}
              <span className="text-[10.5px] text-gray-400">prioridad {c.prioridad}</span>
              <span className="ml-auto text-[11px] text-gray-500">{c.enviados_hoy}/{c.cupo_diario} hoy</span>
            </div>

            {c.bloqueo && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {c.bloqueo}
              </div>
            )}

            <div className="px-4 py-3 space-y-1.5">
              {[
                ['Elegibles', c.elegibles, 'bg-blue-500'],
                ['En cola', c.en_cola, 'bg-blue-300'],
                ['Contactados', c.contactados, 'bg-indigo-500'],
                ['Respondieron', c.respondieron, 'bg-amber-500'],
                [c.exito_label, c.exito, 'bg-green-600'],
              ].map(([l, n, cls]) => (
                <div key={l as string} className="flex items-center gap-3">
                  <span className="text-[11.5px] text-gray-500 w-32 shrink-0">{l as string}</span>
                  {barra(n as number, c.elegibles || 1, cls as string)}
                </div>
              ))}
            </div>

            <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 flex items-center gap-5 text-[11px] text-gray-500 flex-wrap">
              <span>Respuesta: <b className="text-gray-700">{c.tasa_respuesta}%</b></span>
              <span>{c.exito_label}: <b className="text-gray-700">{c.tasa_exito}%</b> de contactados</span>
              <span className="ml-auto">plantilla <span className={`font-mono ${c.tiene_plantilla ? 'text-green-600' : 'text-red-500'}`}>{c.plantilla}</span> · bot {c.bot}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        Un estudiante entra a UNA sola campaña, la de mayor prioridad que le corresponda. {d.optouts} opt-out y {d.en_cooldown} en cooldown quedan fuera.
        El resultado se verifica contra un hecho posterior al contacto (pago, conexión, solicitud), nunca contra lo que el estudiante prometió.
      </p>
    </div>
  )
}
