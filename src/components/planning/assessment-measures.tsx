'use client'

import { useState } from 'react'
import { FileText, AlertTriangle } from 'lucide-react'
import { useIAP, SelectorAnio, Tarjeta, ESTADO, BINDING, type Medida } from './assessment-shared'

// ---------------------------------------------------------------------------
// EL TABLERO DE MEDIDAS — el reporte anual completo.
//
// Dos columnas cargan el peso: "Origen" dice de dónde salió el número ESTE
// año, y "Estado" lo juzga con la escala de cinco niveles del documento. La
// primera cambia de año en año a medida que el ERP absorbe más medidas; la
// segunda es la que se defiende ante un acreditador.
// ---------------------------------------------------------------------------
export function AssessmentMeasures() {
  const { d, anioId, cargando, error, traer } = useIAP()
  const [filtro, setFiltro] = useState<string>('todas')
  const [abierta, setAbierta] = useState<string | null>(null)

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando el inventario…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null

  const c = d.cobertura
  const filas = d.medidas.filter(m =>
    filtro === 'todas' ? true
    : filtro === 'erp' ? m.binding === 'erp_formula'
    : filtro === 'externo' ? m.binding !== 'erp_formula'
    : m.estado === filtro)

  const TABS = [
    { k: 'todas', txt: 'Todas', n: c.medidas },
    { k: 'erp', txt: 'Del ERP', n: c.del_erp },
    { k: 'externo', txt: 'Cargadas fuera', n: c.medidas - c.del_erp },
    { k: 'cumplido', txt: 'Cumplidas', n: c.cumplidos },
    { k: 'no_cumplido', txt: 'No cumplidas', n: c.no_cumplidos },
    { k: 'sin_datos', txt: 'Sin datos', n: c.sin_datos },
  ]

  const pctErp = c.medidas ? Math.round((c.del_erp * 100) / c.medidas) : 0

  return (
    <div className="space-y-5">
      <SelectorAnio d={d} anioId={anioId} cargando={cargando} traer={traer} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Automatización del año" valor={`${pctErp}%`} detalle={`${c.del_erp} de ${c.medidas} salen del ERP`} />
        <Tarjeta titulo="Con resultado" valor={c.con_resultado} detalle={`${c.con_evidencia} con evidencia adjunta`} alerta={c.con_evidencia < c.con_resultado} />
        <Tarjeta titulo="No cumplidas" valor={c.no_cumplidos} detalle={`${c.parciales} parciales · ${c.cumplidos} cumplidas`} alerta={c.no_cumplidos > 0} />
        <Tarjeta titulo="Sin datos" valor={c.sin_datos} detalle="la fuente no produjo información" alerta={c.sin_datos > 0} />
      </div>

      {!!c.discrepancias && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
          <b>{c.discrepancias} medida(s)</b> tienen un valor reportado distinto del que calcula el ERP. Alguien tiene
          que decidir cuál vale antes de que el informe salga.
        </div>
      )}

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
              <th className="px-3 py-2 font-medium">IO</th>
              <th className="px-3 py-2 font-medium">Origen</th>
              <th className="px-3 py-2 font-medium">Meta</th>
              <th className="px-3 py-2 font-medium text-right">Resultado</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(m => (
              <FilaMedida key={m.code} m={m} abierta={abierta === m.code}
                toggle={() => setAbierta(abierta === m.code ? null : m.code)} />
            ))}
          </tbody>
        </table>
      </div>

      {/* La escala, en pantalla: si no está a la vista, cada quien la interpreta */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <p className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase text-gray-400">
          Escala de estados
        </p>
        <div className="divide-y divide-gray-50">
          {d.escala.map(e => (
            <div key={e.code} className="flex flex-wrap items-baseline gap-2 px-3 py-2">
              <span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${ESTADO[e.code]?.cls ?? ''}`}>{e.label}</span>
              <span className="text-[12px] text-gray-600">{e.criterio}</span>
              <span className="text-[11.5px] text-gray-400">→ {e.tratamiento}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FilaMedida({ m, abierta, toggle }: { m: Medida; abierta: boolean; toggle: () => void }) {
  const est = m.estado ? ESTADO[m.estado] : null
  const bind = BINDING[m.binding] ?? BINDING.pendiente
  return (
    <>
      <tr onClick={toggle} className="cursor-pointer border-t border-gray-100 align-top hover:bg-gray-50/60">
        <td className="px-3 py-2 max-w-md">
          <p className="text-[13px] text-gray-800">
            <span className={`mr-1 rounded px-1 py-0.5 text-[10.5px] font-medium ${
              m.tipo === 'directa' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'}`}>{m.code}</span>
            {m.name}
          </p>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-0.5">
            {m.objetivos.map(o => <span key={o} className="rounded bg-gray-100 px-1 py-0.5 text-[10.5px] text-gray-600">{o}</span>)}
          </div>
        </td>
        <td className="px-3 py-2">
          <span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${bind.cls}`}>{bind.txt}</span>
        </td>
        <td className="px-3 py-2 max-w-[14rem] text-[12px] text-gray-600">{m.meta_texto ?? '—'}</td>
        <td className="px-3 py-2 text-right tabular-nums text-[13px] font-medium text-gray-800">
          {m.resultado_texto ?? '—'}
          {m.discrepa && (
            <span title={`El ERP calcula ${m.resultado_erp}`} className="ml-1 inline-flex align-middle text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          {est ? <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] ${est.cls}`}>{est.txt}</span>
               : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-2 text-[12px] text-gray-500">{m.responsable ?? '—'}</td>
        <td className="px-3 py-2">
          {m.evidencias.length
            ? <span className="inline-flex items-center gap-1 text-[12px] text-gray-500"><FileText className="h-3.5 w-3.5" />{m.evidencias.length}</span>
            : <span className="text-[11px] text-amber-600">falta</span>}
        </td>
      </tr>

      {abierta && (
        <tr className="border-t border-gray-100 bg-gray-50/60">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo t="¿Qué busca evaluar?" v={m.proposito} />
              <Campo t="Uso esperado de los resultados" v={m.uso_esperado} />
              <Campo t="Información mínima a recopilar" v={m.dato_minimo} />
              <Campo t="Evidencia esperada" v={m.evidencia_esperada} />
              <Campo t="Tipo de cruce" v={m.tipo_cruce} />
              <Campo t="Si no existe cruce directo" v={m.sin_cruce} />
              <Campo t="Unidad responsable" v={m.unidad} />
              <Campo t="Fuente de datos" v={m.fuente_dato} />
              <Campo t="KPI del Plan de Efectividad" v={m.kpis_efectividad.join(', ')} />
              <Campo t="KPI del Plan Estratégico" v={m.kpis_estrategicos.join(', ')} />
            </div>
            {!!m.evidencias.length && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase text-gray-400">Evidencia cargada</p>
                <ul className="mt-1 space-y-0.5">
                  {m.evidencias.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-gray-600">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
                      {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{e.label}</a> : e.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Campo({ t, v }: { t: string; v: string | null }) {
  if (!v) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-gray-400">{t}</p>
      <p className="text-[12.5px] leading-relaxed text-gray-700">{v}</p>
    </div>
  )
}
