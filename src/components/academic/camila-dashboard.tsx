'use client'

import { useEffect, useState } from 'react'
import { Loader2, TrendingUp, AlertTriangle, MessageSquare, Users } from 'lucide-react'

type Data = {
  config: { enabled: boolean; daily_cap: number; contact_debtors: boolean }
  embudo: { total: number; no_activo: number; sin_telefono: number; deudores: number; elegibles: number; en_cola: number; contactados: number; respondieron: number; volvieron: number }
  tasas: { respuesta: number; compromiso: number; cumplimiento: number; reconexion: number }
  control: { contactados: number; volvieron_contactados: number; tasa_contactados: number; en_cola: number; volvieron_cola: number; tasa_cola: number; efecto: number }
  compromisos: { total: number; verificados: number; cumplieron: number; incumplieron: number; pendientes: number }
  plantillas: Record<string, { enviados: number; respondieron: number; fallidos: number }>
  trabas: Record<string, number>
  fase_b: { expedientes: number; revertidos: number; loa: number; iw: number }
  conversaciones: { total: number; promedio_mensajes: number }
  bajas: number
}

const TRABA_LABEL: Record<string, string> = {
  deuda: 'Deuda', tiempo: 'Tiempo / trabajo', salud: 'Salud / personal',
  dificultad: 'Dificultad académica', acceso: 'No puede entrar al aula',
}
const TPL_LABEL: Record<string, string> = {
  camila_retencion_dia1: 'Día 1 · saludo', camila_retencion_dia3: 'Día 3 · seguimiento',
  camila_retencion_dia7: 'Día 7 · recordatorio', camila_retencion_dia14: 'Día 14 · último',
  camila_retencion_deuda: 'Deuda · acceso bloqueado',
}

function Barra({ label, n, total, cls }: { label: string; n: number; total: number; cls: string }) {
  const pct = total ? (n / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div className={`h-full ${cls} flex items-center justify-end pr-2`} style={{ width: `${Math.max(pct, 3)}%` }}>
          <span className="text-[10px] font-semibold text-white">{n}</span>
        </div>
      </div>
      <span className="text-[11px] text-gray-400 w-10 text-right">{Math.round(pct)}%</span>
    </div>
  )
}

export function CamilaDashboard() {
  const [d, setD] = useState<Data | null>(null)
  useEffect(() => { fetch('/api/academic/camila').then(r => r.json()).then(setD) }, [])

  if (!d) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
  if ('error' in d) return <p className="text-sm text-red-500">{String((d as { error: string }).error)}</p>

  const e = d.embudo

  return (
    <div className="space-y-5">
      {/* Estado */}
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded-full font-medium ${d.config.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {d.config.enabled ? '🟢 Campaña encendida' : '⚪ Campaña apagada'}
        </span>
        <span className="text-gray-400">{d.config.daily_cap}/día · deudores {d.config.contact_debtors ? 'incluidos' : 'fuera'}</span>
      </div>

      {/* LA cifra. El tablero abre con esto y no con "mensajes enviados". */}
      <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white">
        <p className="text-xs uppercase tracking-wide text-green-100">Volvieron al aula</p>
        <p className="text-5xl font-bold mt-1">{e.volvieron}</p>
        <p className="text-sm text-green-100 mt-1">
          de {e.contactados} contactados · {d.tasas.reconexion}% — verificado contra la última conexión, no contra lo que prometieron
        </p>
      </div>

      {/* El embudo */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" />El embudo</h3>
        <div className="space-y-2">
          <Barra label="Ausentes del aula" n={e.no_activo + e.sin_telefono + e.elegibles} total={e.no_activo + e.sin_telefono + e.elegibles} cls="bg-gray-400" />
          <Barra label="— No activos" n={e.no_activo} total={e.no_activo + e.sin_telefono + e.elegibles} cls="bg-gray-300" />
          <Barra label="— Sin teléfono" n={e.sin_telefono} total={e.no_activo + e.sin_telefono + e.elegibles} cls="bg-gray-300" />
          <Barra label="Elegibles" n={e.elegibles} total={e.no_activo + e.sin_telefono + e.elegibles} cls="bg-blue-500" />
          <Barra label="— En cola" n={e.en_cola} total={e.elegibles || 1} cls="bg-blue-300" />
          <Barra label="Contactados" n={e.contactados} total={e.elegibles || 1} cls="bg-violet-500" />
          <Barra label="Respondieron" n={e.respondieron} total={e.contactados || 1} cls="bg-amber-500" />
          <Barra label="Volvieron al aula" n={e.volvieron} total={e.contactados || 1} cls="bg-green-600" />
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          De los elegibles, {e.deudores} son deudores con el aula bloqueada: van por su propia vía.
        </p>
      </div>

      {/* Las 4 tasas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { k: 'Respuesta', v: d.tasas.respuesta, sub: 'contestaron / contactados', hint: 'Si es baja, falla la plantilla' },
          { k: 'Compromiso', v: d.tasas.compromiso, sub: 'dieron fecha / contestaron', hint: 'Si es baja, Camila no cierra' },
          { k: 'Cumplimiento', v: d.tasas.cumplimiento, sub: 'volvieron / prometieron', hint: 'Si es baja, la promesa era de cortesía' },
          { k: 'Reconexión', v: d.tasas.reconexion, sub: 'volvieron / contactados', hint: 'El resultado del programa' },
        ].map(t => (
          <div key={t.k} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">{t.k}</p>
            <p className="text-2xl font-bold text-gray-800">{t.v}%</p>
            <p className="text-[10px] text-gray-400">{t.sub}</p>
            <p className="text-[10px] text-gray-500 mt-1 italic">{t.hint}</p>
          </div>
        ))}
      </div>

      {/* Grupo de control */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gray-400" />¿Camila causa las reconexiones?</h3>
        <p className="text-[11px] text-gray-400 mb-3">Los que siguen en cola no recibieron nada: son el control. Sin esta comparación nos atribuiríamos a los que iban a volver solos.</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-violet-50 rounded-lg p-3">
            <p className="text-[10px] text-violet-600 uppercase">Contactados</p>
            <p className="text-xl font-bold text-violet-800">{d.control.tasa_contactados}%</p>
            <p className="text-[10px] text-violet-500">{d.control.volvieron_contactados} de {d.control.contactados}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase">En cola (control)</p>
            <p className="text-xl font-bold text-gray-700">{d.control.tasa_cola}%</p>
            <p className="text-[10px] text-gray-400">{d.control.volvieron_cola} de {d.control.en_cola}</p>
          </div>
          <div className={`rounded-lg p-3 ${d.control.efecto > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
            <p className="text-[10px] text-gray-500 uppercase">Efecto Camila</p>
            <p className={`text-xl font-bold ${d.control.efecto > 0 ? 'text-green-700' : 'text-gray-600'}`}>
              {d.control.efecto > 0 ? '+' : ''}{Math.round(d.control.efecto * 10) / 10} pts
            </p>
            <p className="text-[10px] text-gray-400">diferencia real</p>
          </div>
        </div>
      </div>

      {/* Promesa vs realidad */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">La promesa contra la realidad</h3>
        <div className="flex gap-6 text-sm">
          <div><p className="text-2xl font-bold text-gray-800">{d.compromisos.total}</p><p className="text-[11px] text-gray-400">prometieron volver</p></div>
          <div><p className="text-2xl font-bold text-green-700">{d.compromisos.cumplieron}</p><p className="text-[11px] text-gray-400">cumplieron</p></div>
          <div><p className="text-2xl font-bold text-red-600">{d.compromisos.incumplieron}</p><p className="text-[11px] text-gray-400">incumplieron</p></div>
          <div><p className="text-2xl font-bold text-gray-400">{d.compromisos.pendientes}</p><p className="text-[11px] text-gray-400">aún no vence</p></div>
        </div>
      </div>

      {/* Causas de deserción */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-gray-400" />Por qué se van</h3>
        <p className="text-[11px] text-gray-400 mb-3">La causa de deserción. Hoy la institución sabe cuántos se fueron, no por qué. Esto lo produce Camila y no existe en ningún otro registro.</p>
        {Object.keys(d.trabas).length === 0 ? (
          <p className="text-xs text-gray-400 py-3">Aún sin datos. Aparecerán con las primeras conversaciones.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(d.trabas).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <Barra key={k} label={TRABA_LABEL[k] ?? k} n={v} total={Object.values(d.trabas).reduce((a, b) => a + b, 0)} cls="bg-rose-500" />
            ))}
          </div>
        )}
      </div>

      {/* Por plantilla */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">¿Qué mensaje engancha?</h3>
        {Object.keys(d.plantillas).length === 0 ? (
          <p className="text-xs text-gray-400 py-3">Aún no se ha enviado nada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-2">Plantilla</th><th className="text-right">Enviados</th><th className="text-right">Respondieron</th><th className="text-right">Tasa</th><th className="text-right">Fallidos</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {Object.entries(d.plantillas).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-2 text-gray-700">{TPL_LABEL[k] ?? k}</td>
                  <td className="text-right text-gray-600">{v.enviados}</td>
                  <td className="text-right text-gray-600">{v.respondieron}</td>
                  <td className="text-right font-semibold text-gray-800">{v.enviados ? Math.round(v.respondieron / v.enviados * 100) : 0}%</td>
                  <td className={`text-right ${v.fallidos ? 'text-red-600 font-medium' : 'text-gray-300'}`}>{v.fallidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Fase B + salud */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Anunciaron su retiro</h3>
          <div className="flex gap-5 text-sm">
            <div><p className="text-xl font-bold text-gray-800">{d.fase_b.expedientes}</p><p className="text-[11px] text-gray-400">expedientes</p></div>
            <div><p className="text-xl font-bold text-green-700">{d.fase_b.revertidos}</p><p className="text-[11px] text-gray-400">revertidos</p></div>
            <div><p className="text-xl font-bold text-orange-600">{d.fase_b.loa}</p><p className="text-[11px] text-gray-400">LOA</p></div>
            <div><p className="text-xl font-bold text-rose-600">{d.fase_b.iw}</p><p className="text-[11px] text-gray-400">IW</p></div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-gray-400" />Conversaciones</h3>
          <div className="flex gap-5 text-sm">
            <div><p className="text-xl font-bold text-gray-800">{d.conversaciones.total}</p><p className="text-[11px] text-gray-400">totales</p></div>
            <div><p className="text-xl font-bold text-gray-800">{d.conversaciones.promedio_mensajes}</p><p className="text-[11px] text-gray-400">msgs promedio</p></div>
            <div><p className={`text-xl font-bold ${d.bajas ? 'text-red-600' : 'text-gray-400'}`}>{d.bajas}</p><p className="text-[11px] text-gray-400">pidieron no ser contactados</p></div>
          </div>
        </div>
      </div>
    </div>
  )
}
