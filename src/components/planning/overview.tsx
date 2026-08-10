'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Download, AlertTriangle, Target, ListChecks, LayoutGrid } from 'lucide-react'

interface Fila {
  code: string; name: string; dimension: string; unidad: string | null; formula: string
  planes: string[]; meta: number | null; operador: string; meta_texto?: string | null
  resultado: number | null; estado: string; motivo: string; sospecha: string | null
  responsable: string | null; razon?: string
}
interface Cuenta { total: number; cumplido: number; parcial: number; no_cumplido: number; sin_datos: number; no_aplicable: number }
interface Data {
  anio: { id: string; name: string }; anios: { id: string; name: string }[]
  resumen: { todos: Cuenta; PE: Cuenta; EF: Cuenta; EV: Cuenta }
  dimensiones: string[]; oportunidades: Fila[]; filas: Fila[]
}

const EST: Record<string, { label: string; cls: string; punto: string }> = {
  cumplido: { label: 'Cumplido', cls: 'bg-green-50 text-green-700', punto: 'bg-green-500' },
  parcial: { label: 'Parcialmente cumplido', cls: 'bg-amber-50 text-amber-800', punto: 'bg-amber-500' },
  no_cumplido: { label: 'No cumplido', cls: 'bg-red-50 text-red-700', punto: 'bg-red-500' },
  sin_datos: { label: 'Sin datos', cls: 'bg-gray-100 text-gray-600', punto: 'bg-gray-400' },
  no_aplicable: { label: 'No aplicable', cls: 'bg-violet-50 text-violet-700', punto: 'bg-violet-400' },
}
const PLAN: Record<string, string> = { PE: 'Plan Estratégico', EF: 'Plan de Efectividad', EV: 'Plan de Evaluación' }
const sel = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
const num = (n: number | null) => n == null ? '—' : Number.isInteger(n) ? String(n) : String(n)

export function PlanningOverview() {
  const [d, setD] = useState<Data | null>(null)
  const [anio, setAnio] = useState('')
  const [vista, setVista] = useState<'panorama' | 'indicadores' | 'oportunidades'>('panorama')
  const [fPlan, setFPlan] = useState(''); const [fDim, setFDim] = useState('')
  const [fEst, setFEst] = useState(''); const [q, setQ] = useState('')

  useEffect(() => {
    fetch(`/api/planning/overview${anio ? `?anio=${anio}` : ''}`).then(r => r.json()).then(setD).catch(() => null)
  }, [anio])

  const filas = useMemo(() => (d?.filas ?? []).filter(f =>
    (!fPlan || f.planes.includes(fPlan)) && (!fDim || f.dimension === fDim) && (!fEst || f.estado === fEst) &&
    (!q.trim() || `${f.code} ${f.name}`.toLowerCase().includes(q.trim().toLowerCase()))), [d, fPlan, fDim, fEst, q])

  function exportar() {
    const cab = ['Código', 'Indicador', 'Dimensión', 'Planes', 'Meta', 'Resultado', 'Estado', 'Motivo', 'Responsable', 'Fórmula']
    const filas2 = filas.map(f => [f.code, f.name, f.dimension, f.planes.join('+'),
      `${f.operador}${f.meta ?? ''}`, f.resultado ?? '', EST[f.estado]?.label ?? f.estado, f.motivo, f.responsable ?? '', f.formula])
    const csv = [cab, ...filas2].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `indicadores-${d?.anio.name.replace(/\s+/g, '-')}.csv`
    a.click()
  }

  if (!d) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['panorama', 'Panorama', LayoutGrid], ['indicadores', 'Indicadores', ListChecks], ['oportunidades', 'Oportunidades de mejora', Target]] as const)
          .map(([k, t, Icon]) => (
            <button key={k} onClick={() => setVista(k)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${vista === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              <Icon className="w-3.5 h-3.5" />{t}
              {k === 'oportunidades' && d.oportunidades.length > 0 && (
                <span className={`ml-1 px-1.5 rounded-full text-[10px] ${vista === k ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>{d.oportunidades.length}</span>
              )}
            </button>
          ))}
        <div className="flex-1" />
        <select className={sel} value={anio || d.anio.id} onChange={e => setAnio(e.target.value)}>
          {d.anios.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {vista === 'panorama' && (
        <>
          <div className="bg-gradient-to-br from-[#0F3A66] to-[#144A81] text-white rounded-2xl p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-blue-200">Panorama institucional · {d.anio.name}</p>
            <p className="text-2xl font-bold mt-2">{d.resumen.todos.total} indicadores en tres planes</p>
            <p className="text-sm text-blue-100 mt-1 max-w-2xl leading-relaxed">
              El estado se calcula con la meta y el resultado del año, igual para los tres planes. Un indicador que
              vive en varios planes es <b>uno solo</b>: se cuenta una vez aquí y aparece en cada plan al que pertenece.
            </p>
            <div className="flex flex-wrap gap-5 mt-4 text-sm">
              {(['cumplido', 'parcial', 'no_cumplido', 'sin_datos', 'no_aplicable'] as const).map(k => (
                d.resumen.todos[k] > 0 && (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${EST[k].punto}`} />
                    <b>{d.resumen.todos[k]}</b> <span className="text-blue-100">{EST[k].label.toLowerCase()}</span>
                  </span>
                )
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['PE', 'EF', 'EV'] as const).map(p => {
              const c = d.resumen[p]
              return (
                <button key={p} onClick={() => { setFPlan(p); setVista('indicadores') }}
                  className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
                  <p className="text-sm font-semibold text-gray-800">{PLAN[p]}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{c.total}</p>
                  <div className="flex h-2 rounded overflow-hidden bg-gray-100 mt-3">
                    {(['cumplido', 'parcial', 'no_cumplido', 'sin_datos', 'no_aplicable'] as const).map(k => (
                      c[k] > 0 && <div key={k} className={EST[k].punto} style={{ width: `${(c[k] / c.total) * 100}%` }} />
                    ))}
                  </div>
                  <div className="mt-3 space-y-1">
                    {(['cumplido', 'parcial', 'no_cumplido', 'sin_datos', 'no_aplicable'] as const).map(k => (
                      c[k] > 0 && (
                        <p key={k} className="text-xs text-gray-500 flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${EST[k].punto}`} />
                          <b className="text-gray-800">{c[k]}</b> {EST[k].label}
                        </p>
                      )
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {vista !== 'panorama' && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <input className={`${sel} flex-1 min-w-[200px]`} placeholder="Buscar por código o nombre…" value={q} onChange={e => setQ(e.target.value)} />
          <select className={sel} value={fPlan} onChange={e => setFPlan(e.target.value)}>
            <option value="">Todos los planes</option>
            {Object.entries(PLAN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <select className={sel} value={fDim} onChange={e => setFDim(e.target.value)}>
            <option value="">Todas las dimensiones</option>
            {d.dimensiones.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select className={sel} value={fEst} onChange={e => setFEst(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(EST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={exportar} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" />Exportar
          </button>
        </div>
      )}

      {vista === 'indicadores' && <Tabla filas={filas} total={d.filas.length} />}

      {vista === 'oportunidades' && (
        <>
          <p className="text-xs text-gray-500 leading-relaxed">
            Indicadores que pueden cambiar de estado <b>sin cambiar la gestión</b>: los que solo esperan el dato, los
            que están a menos del 10% de su meta, y aquellos cuyo resultado no es comparable con la meta. Es una lista
            de trabajo, no un reproche.
          </p>
          <Tabla filas={d.oportunidades.filter(f => filas.some(x => x.code === f.code))} total={d.oportunidades.length} conRazon />
        </>
      )}
    </div>
  )
}

function Tabla({ filas, total, conRazon }: { filas: Fila[]; total: number; conRazon?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
        {filas.length} de {total} indicadores
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 w-24">Código</th>
              <th className="text-left px-3 py-2.5">Indicador</th>
              <th className="text-left px-3 py-2.5 w-40">Dimensión</th>
              <th className="text-left px-3 py-2.5 w-24">Planes</th>
              <th className="text-right px-3 py-2.5 w-20">Meta</th>
              <th className="text-right px-3 py-2.5 w-20">Resultado</th>
              <th className="text-left px-3 py-2.5 w-40">Estado</th>
              {conRazon && <th className="text-left px-3 py-2.5 w-56">Por qué está aquí</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.map(f => {
              const e = EST[f.estado] ?? EST.sin_datos
              return (
                <tr key={f.code} className="hover:bg-gray-50/50 align-top">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{f.code}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-gray-800">{f.name}</p>
                    {f.sospecha && (
                      <p className="text-[11px] text-amber-700 flex items-start gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />{f.sospecha}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{f.dimension}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] font-mono text-gray-600">{f.planes.join(' · ')}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{f.meta == null ? '—' : `${f.operador}${num(f.meta)}`}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-800">{num(f.resultado)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.cls}`}>{e.label}</span>
                    <p className="text-[11px] text-gray-400 mt-0.5">{f.motivo}</p>
                  </td>
                  {conRazon && <td className="px-3 py-2.5 text-xs text-gray-600">{f.razon}</td>}
                </tr>
              )
            })}
            {filas.length === 0 && <tr><td colSpan={conRazon ? 8 : 7} className="text-center text-gray-400 py-12 text-sm">Nada que mostrar con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
