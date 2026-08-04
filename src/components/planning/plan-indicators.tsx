'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, Target, Zap, CircleDashed } from 'lucide-react'

interface Indicador {
  id: string; code: string; name: string; level: string
  value_type: string; frequency: string; source: string
  meta: number | null; meta_operator: string
  benchmark: number | null; benchmark_operator: string
  resultado: number | null; resultado_at: string | null
  responsable: string | null
  origen: 'objetivo' | 'accion'; origen_nombre: string | null
}
interface Objetivo { id: string; code: string; name: string; indicadores: Indicador[] }
interface Dimension { id: string; code: string; name: string; objetivos: Objetivo[] }
interface Data {
  ciclo: { name: string; start_year: number; end_year: number }
  anio: { id: string; etiqueta: string; start_date: string; end_date: string } | null
  anios: { id: string; etiqueta: string }[]
  migrado: boolean
  cobertura: {
    objetivos: number; objetivos_medidos: number; objetivos_sin_medir: number
    indicadores: number; con_meta: number; con_resultado: number; automaticos: number
  }
  dimensiones: Dimension[]
}

const fmt = (v: number | null, tipo: string) =>
  v === null ? '—' : tipo === 'porcentaje' ? `${v}%` : v.toLocaleString('es-PE')

// ¿El resultado cumple la meta? null = todavía no se puede decir.
function cumple(i: Indicador): boolean | null {
  if (i.resultado === null || i.meta === null) return null
  return i.meta_operator === '<=' ? i.resultado <= i.meta : i.resultado >= i.meta
}

const FUENTE: Record<string, { txt: string; cls: string }> = {
  formula:  { txt: 'automático', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  encuesta: { txt: 'encuesta',   cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  rubrica:  { txt: 'rúbrica',    cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  manual:   { txt: 'manual',     cls: 'bg-gray-50 text-gray-600 border-gray-200' },
}

export function PlanIndicators() {
  const [d, setD] = useState<Data | null>(null)
  const [anioId, setAnioId] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = async (id?: string) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/planning/indicators${id ? `?academic_year_id=${id}` : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setD(j); setAnioId(j.anio?.id ?? '')
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando el tablero…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null

  const c = d.cobertura

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{d.ciclo.name}</p>
          <p className="text-xs text-gray-500">{d.ciclo.start_year}–{d.ciclo.end_year}</p>
        </div>
        <select value={anioId} onChange={e => traer(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm">
          {d.anios.map(y => <option key={y.id} value={y.id}>Año académico {y.etiqueta}</option>)}
        </select>
        <button onClick={() => traer(anioId)} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {!d.migrado && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Falta correr el Paso 1.</b> Los resultados se están leyendo de la tabla vieja del Plan de
          Efectividad. Hasta que exista <code>indicator_results</code>, un mismo indicador puede mostrar
          números distintos en cada plan.
        </div>
      )}

      {/* Cobertura: para esto existe el tablero. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Objetivos sin medir" valor={c.objetivos_sin_medir}
          detalle={`de ${c.objetivos} objetivos del plan`} alerta={c.objetivos_sin_medir > 0} />
        <Tarjeta titulo="Indicadores" valor={c.indicadores} detalle={`${c.automaticos} se calculan solos`} />
        <Tarjeta titulo="Con meta definida" valor={c.con_meta} detalle={`de ${c.indicadores}`}
          alerta={c.con_meta < c.indicadores} />
        <Tarjeta titulo="Con resultado cargado" valor={c.con_resultado} detalle={`de ${c.indicadores}`}
          alerta={c.con_resultado < c.indicadores} />
      </div>

      {d.dimensiones.map(dim => (
        <div key={dim.id} className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-800">
              <span className="text-gray-400">{dim.code}</span> {dim.name}
            </p>
          </div>

          {dim.objetivos.map(o => (
            <div key={o.id} className="border-b border-gray-100 last:border-0">
              <div className="flex items-start gap-2 px-4 py-2.5">
                <Target className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-gray-700">
                    <b className="text-gray-500">{o.code}</b> {o.name}
                  </p>
                  {!o.indicadores.length && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Este objetivo no tiene ningún indicador. El plan lo declara y nadie lo mide.
                    </p>
                  )}
                </div>
              </div>

              {!!o.indicadores.length && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60 text-left text-[11px] uppercase text-gray-400">
                      <tr>
                        <th className="px-4 py-1.5 font-medium">Indicador</th>
                        <th className="px-3 py-1.5 font-medium">Fuente</th>
                        <th className="px-3 py-1.5 font-medium text-right">Meta</th>
                        <th className="px-3 py-1.5 font-medium text-right">Resultado</th>
                        <th className="px-3 py-1.5 font-medium">Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.indicadores.map(i => {
                        const ok = cumple(i)
                        return (
                          <tr key={i.id + i.origen_nombre} className="border-t border-gray-50">
                            <td className="px-4 py-2">
                              <p className="text-[13px] text-gray-800">
                                <span className="text-gray-400 tabular-nums">{i.code}</span> {i.name}
                              </p>
                              {i.origen === 'accion' && i.origen_nombre && (
                                <p className="text-[11px] text-gray-400">vía {i.origen_nombre}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${FUENTE[i.source]?.cls ?? FUENTE.manual.cls}`}>
                                {i.source === 'formula' ? <Zap className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                                {FUENTE[i.source]?.txt ?? i.source}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                              {i.meta === null ? <span className="text-amber-600">sin meta</span>
                                : `${i.meta_operator} ${fmt(i.meta, i.value_type)}`}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                              ok === null ? 'text-gray-300' : ok ? 'text-emerald-700' : 'text-red-700'}`}>
                              {fmt(i.resultado, i.value_type)}
                            </td>
                            <td className="px-3 py-2 text-[12px] text-gray-500">{i.responsable ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <p className="text-xs text-gray-500">
        Los indicadores se administran desde <b>Plan de Efectividad → Cargar Plan</b>; aquí se ven ordenados por
        el árbol del plan estratégico, que es donde se nota cuál objetivo quedó sin medir. La <b>meta</b> es de
        cada plan y puede diferir; el <b>resultado</b> es único por indicador y año académico.
      </p>
    </div>
  )
}

function Tarjeta({ titulo, valor, detalle, alerta }: { titulo: string; valor: number; detalle: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alerta ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className={`text-2xl font-bold tabular-nums ${alerta ? 'text-amber-800' : 'text-gray-900'}`}>{valor}</p>
      <p className="text-[11px] text-gray-400">{detalle}</p>
    </div>
  )
}
