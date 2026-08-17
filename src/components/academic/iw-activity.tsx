'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react'

type Veredicto = 'coherente' | 'nunca_entro' | 'activo_despues' | 'sin_dato'

interface Caso {
  student_id: string; nombre: string; documento: string | null
  retiro: string | null; origen: string
  moodle_ultimo: string | null; moodle_suspendido: boolean | null
  correo_ultimo: string | null
  dias_desde_el_ultimo_acceso: number | null
  veredicto: Veredicto
}
interface Data {
  vigentes: number; con_cuenta_moodle: number; con_correo: number
  moodle_disponible: boolean; correo_disponible: boolean
  por_veredicto: Record<Veredicto, number>
  activos_ultimos_30_dias: number
  activos_despues_sin_suspender: number
  casos: Caso[]
}

const ETIQUETA: Record<Veredicto, string> = {
  activo_despues: 'Entró DESPUÉS del retiro',
  coherente: 'Su último acceso es anterior al retiro',
  nunca_entro: 'Tiene cuenta y nunca la usó',
  sin_dato: 'Sin cuenta que mirar — no se puede saber',
}

export function IWActivity() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Veredicto>('activo_despues')
  const [vinculando, setVinculando] = useState(false)
  const [vinculo, setVinculo] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/academic/iw-activity')
      const d = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}` }))
      if (!r.ok || d.error) { setError(d.error ?? 'Error'); return }
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Vincula por tandas: cada estudiante cuesta hasta tres llamadas a Moodle y
  // los 344 no caben en una sola corrida. Cada vínculo se guarda al momento,
  // así que volver a pulsar continúa donde quedó.
  const vincular = useCallback(async () => {
    setVinculando(true); setVinculo(null)
    try {
      const r = await fetch('/api/academic/iw-activity', { method: 'POST' })
      const d = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}` }))
      if (!r.ok || d.error) { setVinculo(d.error ?? 'No se pudo vincular'); return }
      const s = d.resumen ?? {}
      setVinculo(
        `Procesados ${d.procesados} de ${d.pendientes_antes} pendientes · ` +
        `vinculados ${s.vinculado ?? 0} · candidatos por confirmar ${s.candidato ?? 0} · ` +
        `ambiguos ${s.ambiguo ?? 0} · sin cuenta ${s.sin_cuenta ?? 0}` +
        (d.quedan ? ` · quedan ${d.quedan}: vuelve a pulsar` : ' · no queda ninguno')
      )
      await load()
    } catch (e) {
      setVinculo(e instanceof Error ? e.message : 'Error de red')
    } finally { setVinculando(false) }
  }, [load])

  if (loading && !data) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      <p className="text-xs text-gray-400">Consultando Moodle y el directorio de correo…</p>
    </div>
  )
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!data) return null

  const v = data.por_veredicto
  const lista = data.casos.filter(c => c.veredicto === filtro)

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-gray-600 leading-relaxed space-y-2 max-w-3xl">
            <p>
              Un IW vigente significa hoy una sola cosa: <strong>existe un retiro y no existe una reincorporación</strong>.
              Eso es lo que dicen los papeles. Aquí se contrasta contra lo que hizo el estudiante.
            </p>
            <p className="text-xs text-gray-400">
              Si alguien retirado sigue entrando al campus o al correo, o el retiro no se ejecutó, o se revirtió sin
              dejar rastro. En los dos casos está usando servicios que la institución cree cerrados, y la liquidación
              de lo consumido se calculó sobre una foto que no era.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={vincular} disabled={vinculando}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50">
              <Link2 className={`w-3.5 h-3.5 ${vinculando ? 'animate-pulse' : ''}`} />
              {vinculando ? 'Vinculando…' : 'Vincular cuentas de Moodle'}
            </button>
            <button onClick={load} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Volver a consultar
            </button>
          </div>
        </div>
        {vinculo && (
          <p className="text-xs mt-3 px-3 py-2 rounded-lg bg-gray-50 text-gray-600">
            {vinculo}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-3">
          {data.vigentes} IW vigentes · {data.con_cuenta_moodle} con cuenta de Moodle · {data.con_correo} con acceso al correo registrado
          {!data.moodle_disponible && <span className="text-amber-600"> · Moodle no respondió</span>}
          {!data.correo_disponible && <span className="text-amber-600"> · el directorio de correo no respondió</span>}
        </p>
      </div>

      {v.activo_despues > 0 ? (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>{v.activo_despues}</strong> retirados entraron después de su fecha de retiro.
            {data.activos_ultimos_30_dias > 0 && <> {data.activos_ultimos_30_dias} lo hicieron en los últimos 30 días.</>}
            {data.activos_despues_sin_suspender > 0 && <> Y <strong>{data.activos_despues_sin_suspender}</strong> conservan la cuenta de Moodle sin suspender.</>}
          </span>
        </div>
      ) : (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Ningún retirado registra actividad posterior a su retiro.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(ETIQUETA) as Veredicto[]).map(k => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`text-left px-4 py-3 rounded-xl border transition ${filtro === k ? 'border-gray-800 bg-white' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <p className={`text-2xl font-bold tabular-nums ${k === 'activo_despues' && v[k] > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
              {v[k].toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{ETIQUETA[k]}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">{ETIQUETA[filtro]}</p>
          <p className="text-xs text-gray-400">{lista.length} casos</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Estudiante</th>
                <th className="text-left px-3 py-2 font-medium">Retiro</th>
                <th className="text-left px-3 py-2 font-medium">Origen</th>
                <th className="text-left px-3 py-2 font-medium">Campus</th>
                <th className="text-left px-3 py-2 font-medium">Correo</th>
                <th className="text-right px-5 py-2 font-medium">Hace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lista.slice(0, 300).map(c => (
                <tr key={c.student_id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-2">
                    <p className="text-gray-800">{c.nombre}</p>
                    <p className="text-[11px] text-gray-400">{c.documento}</p>
                  </td>
                  <td className="px-3 py-2 text-gray-600 tabular-nums">{c.retiro ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{c.origen}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">
                    {c.moodle_ultimo ?? '—'}
                    {c.moodle_suspendido === false && <span className="ml-1.5 text-[10px] text-amber-600">activa</span>}
                    {c.moodle_suspendido === true && <span className="ml-1.5 text-[10px] text-gray-400">suspendida</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{c.correo_ultimo ?? '—'}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-gray-500">
                    {c.dias_desde_el_ultimo_acceso != null ? `${c.dias_desde_el_ultimo_acceso} d` : '—'}
                  </td>
                </tr>
              ))}
              {!lista.length && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">Sin casos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {lista.length > 300 && (
          <p className="px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100">
            Se muestran los 300 más recientes de {lista.length}.
          </p>
        )}
      </div>
    </div>
  )
}
