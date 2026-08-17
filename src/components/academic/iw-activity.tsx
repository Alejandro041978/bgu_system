'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Link2, GraduationCap, Mail } from 'lucide-react'

type Veredicto = 'antes' | 'despues' | 'nunca' | 'sin_cuenta'

interface Bloque {
  con_cuenta: number; antes: number; despues: number; nunca: number
  sin_cuenta: number; disponible: boolean
}
interface Caso {
  student_id: string; nombre: string; documento: string | null
  retiro: string | null; origen: string
  moodle_ultimo: string | null; moodle_suspendido: boolean | null; moodle_veredicto: Veredicto
  correo_ultimo: string | null; correo_veredicto: Veredicto
  dias_desde_el_ultimo_acceso: number | null
}
interface Data {
  vigentes: number
  campus: Bloque; correo: Bloque
  activos_despues: number
  activos_ultimos_30_dias: number
  activos_despues_sin_suspender: number
  casos: Caso[]
}

type Filtro = { senal: 'campus' | 'correo'; v: Veredicto }

const NOMBRE: Record<Veredicto, string> = {
  antes: 'Último acceso ANTES del retiro',
  despues: 'Último acceso DESPUÉS del retiro',
  nunca: 'Nunca ingresó',
  sin_cuenta: 'Sin cuenta',
}

export function IWActivity() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>({ senal: 'campus', v: 'despues' })
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

  const lista = data.casos.filter(c =>
    (filtro.senal === 'campus' ? c.moodle_veredicto : c.correo_veredicto) === filtro.v)

  const Bloque = ({ senal, b, icono, titulo }: { senal: 'campus' | 'correo'; b: Bloque; icono: React.ReactNode; titulo: string }) => {
    const cuadra = b.antes + b.despues + b.nunca === b.con_cuenta
    const celda = (v: Veredicto, n: number, destacar = false) => (
      <button onClick={() => setFiltro({ senal, v })}
        className={`text-left px-4 py-3 rounded-lg border transition w-full ${
          filtro.senal === senal && filtro.v === v ? 'border-gray-800 bg-white' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
        <p className={`text-xl font-bold tabular-nums ${destacar && n > 0 ? 'text-amber-600' : 'text-gray-700'}`}>{n.toLocaleString()}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{NOMBRE[v]}</p>
      </button>
    )
    return (
      <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">{icono} {titulo}</p>
          <p className="text-xs text-gray-500">
            con acceso: <strong className="text-gray-800 tabular-nums">{b.con_cuenta.toLocaleString()}</strong>
            {!b.disponible && <span className="text-amber-600"> · no respondió</span>}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {celda('antes', b.antes)}
          {celda('despues', b.despues, true)}
          {celda('nunca', b.nunca)}
        </div>
        <p className={`text-[11px] mt-2 ${cuadra ? 'text-gray-400' : 'text-red-600 font-medium'}`}>
          {b.antes} + {b.despues} + {b.nunca} = {b.antes + b.despues + b.nunca}
          {cuadra ? ` · cuadra con los ${b.con_cuenta} que tienen acceso` : ` · NO cuadra con ${b.con_cuenta}`}
          {b.sin_cuenta > 0 && ` · ${b.sin_cuenta} sin cuenta, fuera del cálculo`}
        </p>
      </div>
    )
  }

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
              Las dos señales se miden por separado y cada una cuadra sola. Ir al campus es ir a clase; el correo se
              mira por inercia — por eso un acceso al campus posterior al retiro pesa mucho más que uno al correo.
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
        {vinculo && <p className="text-xs mt-3 px-3 py-2 rounded-lg bg-gray-50 text-gray-600">{vinculo}</p>}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-3xl font-bold text-gray-800 tabular-nums">{data.vigentes.toLocaleString()}</p>
          <p className="text-xs text-gray-500">IW vigentes — con retiro y sin reincorporación</p>
        </div>
      </div>

      {data.activos_despues > 0 ? (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>{data.activos_despues}</strong> retirados entraron después de su fecha de retiro, por campus o por correo.
            {data.activos_ultimos_30_dias > 0 && <> {data.activos_ultimos_30_dias} lo hicieron en los últimos 30 días.</>}
            {data.activos_despues_sin_suspender > 0 && <> Y <strong>{data.activos_despues_sin_suspender}</strong> entraron al campus conservando la cuenta sin suspender.</>}
          </span>
        </div>
      ) : (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Ningún retirado registra actividad posterior a su retiro.
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloque senal="campus" b={data.campus} titulo="Campus virtual" icono={<GraduationCap className="w-4 h-4 text-gray-400" />} />
        <Bloque senal="correo" b={data.correo} titulo="Correo institucional" icono={<Mail className="w-4 h-4 text-gray-400" />} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">
            {filtro.senal === 'campus' ? 'Campus' : 'Correo'} · {NOMBRE[filtro.v]}
          </p>
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
                    {c.moodle_ultimo ?? (c.moodle_veredicto === 'nunca' ? 'nunca' : '—')}
                    {c.moodle_suspendido === false && <span className="ml-1.5 text-[10px] text-amber-600">activa</span>}
                    {c.moodle_suspendido === true && <span className="ml-1.5 text-[10px] text-gray-400">suspendida</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">
                    {c.correo_ultimo ?? (c.correo_veredicto === 'nunca' ? 'nunca' : '—')}
                  </td>
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
