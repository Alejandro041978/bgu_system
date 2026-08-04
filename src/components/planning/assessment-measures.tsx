'use client'

import { useState } from 'react'
import { Zap, CircleDashed } from 'lucide-react'
import { useIAP, SelectorAnio, Tarjeta, FUENTE } from './assessment-shared'

// ---------------------------------------------------------------------------
// EL TABLERO DE MEDIDAS — el inventario completo, con su origen.
//
// La columna que importa es "Fuente": trece de las veinte medidas no tienen de
// dónde salir todavía. Verlas en gris, y no ausentes, es lo que convierte el
// plan en una lista de trabajo en vez de un documento aspiracional.
// ---------------------------------------------------------------------------
export function AssessmentMeasures() {
  const { d, anioId, cargando, error, traer } = useIAP()
  const [filtro, setFiltro] = useState<'todas' | 'directa' | 'indirecta' | 'sin_fuente'>('todas')

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando el inventario…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null

  const c = d.cobertura
  const filas = d.medidas.filter(m =>
    filtro === 'todas' ? true
    : filtro === 'sin_fuente' ? !m.indicador
    : m.tipo === filtro)

  const TABS: { k: typeof filtro; txt: string; n: number }[] = [
    { k: 'todas', txt: 'Todas', n: c.medidas },
    { k: 'directa', txt: 'Directas', n: c.directas },
    { k: 'indirecta', txt: 'Indirectas', n: c.indirectas },
    { k: 'sin_fuente', txt: 'Sin fuente', n: c.sin_fuente },
  ]

  return (
    <div className="space-y-5">
      <SelectorAnio d={d} anioId={anioId} cargando={cargando} traer={traer} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Medidas del inventario" valor={c.medidas} detalle={`${c.directas} directas · ${c.indirectas} indirectas`} />
        <Tarjeta titulo="Sin fuente de datos" valor={c.sin_fuente} detalle="encuestas y rúbricas por construir" alerta={c.sin_fuente > 0} />
        <Tarjeta titulo="Con resultado del año" valor={c.con_resultado} detalle={`de ${c.con_fuente} con fuente`} alerta={c.con_resultado < c.con_fuente} />
        <Tarjeta titulo="Bajo estándar" valor={c.no_cumplen} detalle={`${c.cumplen} cumplen el benchmark`} alerta={c.no_cumplen > 0} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setFiltro(t.k)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filtro === t.k ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {t.txt} <span className="opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-[11px] uppercase text-gray-400">
            <tr>
              <th className="px-3 py-2 font-medium">Medida</th>
              <th className="px-3 py-2 font-medium">Objetivos</th>
              <th className="px-3 py-2 font-medium">Frecuencia</th>
              <th className="px-3 py-2 font-medium">Unidad responsable</th>
              <th className="px-3 py-2 font-medium">Fuente</th>
              <th className="px-3 py-2 font-medium text-right">Estándar</th>
              <th className="px-3 py-2 font-medium text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(m => (
              <tr key={m.code} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  <p className="text-[13px] text-gray-800">
                    <span className={`mr-1 rounded px-1 py-0.5 text-[10.5px] font-medium ${
                      m.tipo === 'directa' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'}`}>{m.code}</span>
                    {m.name}
                  </p>
                  {m.fuente_dato && <p className="text-[11px] text-gray-400">{m.fuente_dato}</p>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-0.5">
                    {m.objetivos.map(o => (
                      <span key={o} className="rounded bg-gray-100 px-1 py-0.5 text-[10.5px] text-gray-600">{o}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-[12px] text-gray-600">
                  {m.frecuencia}{m.ventana && m.ventana !== m.frecuencia ? <span className="block text-[11px] text-gray-400">{m.ventana}</span> : null}
                </td>
                <td className="px-3 py-2 text-[12px] text-gray-600">{m.unidad}</td>
                <td className="px-3 py-2">
                  {m.indicador ? (
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${FUENTE[m.indicador.source] ?? FUENTE.manual}`}>
                      <Zap className="h-3 w-3" />{m.indicador.code}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[10.5px] text-gray-400">
                      <CircleDashed className="h-3 w-3" /> sin fuente
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-[12px] text-gray-600">
                  {m.benchmarks.length ? m.benchmarks.map(b => (
                    <p key={b.scope} className="tabular-nums whitespace-nowrap">
                      {b.scope !== 'general' && <span className="text-gray-400">{b.scope} </span>}
                      {b.operator} {b.value}%
                    </p>
                  )) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                  m.cumple === null ? 'text-gray-300' : m.cumple ? 'text-emerald-700' : 'text-red-700'}`}>
                  {m.resultado === null ? '—' : `${m.resultado}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Las medidas <b>sin fuente</b> no son un error: seis salen de encuestas y siete de rúbricas de evaluación
        directa, y ninguno de los dos subsistemas existe todavía. Aparecen listadas a propósito — un inventario que
        solo muestra lo que ya se puede medir esconde justamente el trabajo que falta.
      </p>
    </div>
  )
}
