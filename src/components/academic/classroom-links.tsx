'use client'

import { useEffect, useState } from 'react'
import { Link2, RefreshCw, Power, PowerOff, Check, AlertTriangle, Ban } from 'lucide-react'

interface Aula {
  aula_id: number
  shortname: string | null
  matriculados: number
  code: string | null
  sufijo: string | null
  course_name: string | null
  programa: string | null
  confianza: 'alta' | 'media' | 'ninguna'
  familia: string | null
  motivo: string
  estado: string
  sync_enabled?: boolean
}
interface Resumen { aulas: number; con_alumnos: number; matriculas: number }
interface Datos {
  aulas_del_campus: number
  ya_vinculadas: number
  sincronizando?: number
  pendientes: Resumen
  listas_para_vincular: { alta: Resumen; media: Resumen }
  sin_propuesta: { no_es_asignatura: Resumen; codigo_desconocido: Resumen; codigo_ambiguo: Resumen }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  discrepancias: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ambiguas: any[]
  aulas: Aula[]
}

const num = (n: number) => n.toLocaleString('es-PE')

export function ClassroomLinks() {
  const [d, setD] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [obrando, setObrando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendientes' | 'todas'>('pendientes')

  const cargar = async (f = filtro) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/academic/moodle-links?solo=${f}&detalle=1`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setD(j)
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { cargar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const accion = async (query: string, etiqueta: string) => {
    setObrando(etiqueta); setAviso(null); setError(null)
    try {
      const r = await fetch(`/api/academic/moodle-links?${query}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falló la operación')
      setAviso(`${etiqueta}: ${JSON.stringify(j)}`)
      await cargar()
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setObrando(null)
  }

  const Tarjeta = ({ titulo, r, tono }: { titulo: string; r?: Resumen; tono?: string }) => (
    <div className={`rounded-lg border p-4 ${tono ?? 'border-slate-200 bg-white'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{num(r?.aulas ?? 0)}</p>
      <p className="text-xs text-slate-500">
        {num(r?.con_alumnos ?? 0)} con alumnos · {num(r?.matriculas ?? 0)} matrículas
      </p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => cargar()} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
        </button>
        <button onClick={() => accion('aplicar=oferta', 'Migrar desde la oferta')} disabled={!!obrando}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
          <Link2 className="h-4 w-4" /> Migrar lo que ya sincroniza
        </button>
        <button onClick={() => accion('aplicar=alta', 'Vincular confianza alta')} disabled={!!obrando}
          className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
          <Check className="h-4 w-4" /> Vincular las de confianza alta
        </button>
        <button onClick={() => accion('aplicar=media', 'Vincular confianza media')} disabled={!!obrando}
          className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50">
          <Check className="h-4 w-4" /> …y las de confianza media
        </button>
        {obrando && <span className="text-sm text-slate-500">Trabajando: {obrando}…</span>}
      </div>

      <p className="text-sm text-slate-600">
        Vincular <strong>no</strong> sincroniza. Declarar qué asignatura enseña un aula es un hecho; traer sus notas al
        ERP es otra decisión, que se enciende aula por aula.
      </p>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {aviso && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta titulo="Aulas del campus" r={{ aulas: d.aulas_del_campus, con_alumnos: 0, matriculas: 0 }} />
            <Tarjeta titulo="Ya vinculadas" r={{ aulas: d.ya_vinculadas, con_alumnos: 0, matriculas: 0 }} />
            <Tarjeta titulo="Confianza alta" r={d.listas_para_vincular.alta} tono="border-emerald-200 bg-emerald-50" />
            <Tarjeta titulo="Confianza media" r={d.listas_para_vincular.media} tono="border-amber-200 bg-amber-50" />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Tarjeta titulo="No son asignaturas" r={d.sin_propuesta.no_es_asignatura} />
            <Tarjeta titulo="Código sin malla" r={d.sin_propuesta.codigo_desconocido} />
            <Tarjeta titulo="Código ambiguo" r={d.sin_propuesta.codigo_ambiguo} />
          </div>

          {!!d.discrepancias?.length && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="flex items-center gap-2 font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" /> {d.discrepancias.length} aulas donde la propuesta no coincide con el vínculo existente
              </p>
              <p className="mt-1 text-sm text-amber-800">
                No se tocan solas. Cada una es un error de alguno de los dos lados y hay que decidirla.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-amber-900/70">
                    <tr><th className="py-1 pr-3">Aula</th><th className="pr-3">Alumnos</th><th className="pr-3">Vinculada hoy a</th><th>La propuesta dice</th></tr>
                  </thead>
                  <tbody>
                    {d.discrepancias.map((x) => (
                      <tr key={x.aula_id} className="border-t border-amber-200">
                        <td className="py-1 pr-3">{x.aula_id} · {x.shortname}</td>
                        <td className="pr-3">{x.matriculados}</td>
                        <td className="pr-3">{x.vinculada_hoy_a}</td>
                        <td>{x.yo_propongo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {(['pendientes', 'todas'] as const).map(f => (
              <button key={f} onClick={() => { setFiltro(f); cargar(f) }}
                className={`rounded-md px-3 py-1.5 text-sm ${filtro === f ? 'bg-slate-900 text-white' : 'border border-slate-300 hover:bg-slate-50'}`}>
                {f === 'pendientes' ? 'Pendientes' : 'Todas'}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Aula</th>
                  <th className="px-3 py-2">Alumnos</th>
                  <th className="px-3 py-2">Asignatura propuesta</th>
                  <th className="px-3 py-2">Confianza</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Sincronía</th>
                </tr>
              </thead>
              <tbody>
                {d.aulas.map(a => (
                  <tr key={a.aula_id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{a.aula_id} · {a.shortname}</div>
                      <div className="text-xs text-slate-500">{a.motivo}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{num(a.matriculados)}</td>
                    <td className="px-3 py-2">
                      {a.course_name ?? <span className="text-slate-400">—</span>}
                      {a.programa && <div className="text-xs text-slate-500">{a.programa}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        a.confianza === 'alta' ? 'bg-emerald-100 text-emerald-800'
                        : a.confianza === 'media' ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'}`}>{a.confianza}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{a.estado.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2">
                      {a.estado === 'pendiente' ? (
                        <span className="text-xs text-slate-400">sin vincular</span>
                      ) : a.sync_enabled ? (
                        <button onClick={() => accion(`apagar=${a.aula_id}`, `Apagar aula ${a.aula_id}`)} disabled={!!obrando}
                          className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                          <Power className="h-3 w-3" /> sincronizando
                        </button>
                      ) : (
                        <button onClick={() => accion(`sincronizar=${a.aula_id}`, `Encender aula ${a.aula_id}`)} disabled={!!obrando}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          <PowerOff className="h-3 w-3" /> apagada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!d.ambiguas?.length && (
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Ban className="h-4 w-4" /> {d.ambiguas.length} aulas donde el código o el nombre no alcanzan para elegir
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {d.ambiguas.map((x) => (
                  <li key={x.aula_id}>{x.aula_id} · {x.shortname} — {x.motivo}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
