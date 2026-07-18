'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react'

interface Aula {
  aula_id: number; shortname: string; fullname: string; visible: boolean
  linked_course: string | null
  recursos: number | null; recursos_activos: number | null
  items_evaluacion: number | null; items_activos: number | null; items_con_peso: number | null
  suma_pesos: number | null; escala_total: number | null
  cumple_pesos: boolean | null; cumple_escala: boolean | null
  metodo: string | null; categoria: string | null; error: string | null; audited_at: string
}
interface Data {
  audited_at: string | null; total: number; cumplen: number; incumplen: number
  pesos_mal: number; escala_mal: number
  sin_evaluaciones: number; sin_ponderacion: number
  sin_datos: number; vinculadas: number
  aulas: Aula[]
}

type Filtro = 'todas' | 'incumplen' | 'cumplen' | 'sin_evaluaciones' | 'sin_ponderacion' | 'sin_datos'

export function CampusAudit() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('incumplen')

  const load = useCallback(async () => {
    const r = await fetch('/api/academic/moodle-audit')
    const data = await r.json()
    if (!r.ok) { setError(data.error ?? 'Error'); return }
    setD(data)
    if ((data.pesos_mal + data.escala_mal) === 0) setFiltro('todas')
  }, [])
  useEffect(() => { load() }, [load])

  async function audit() {
    if (!confirm('Se auditará cada aula del campus contra la política (ponderaciones 100% y escala sobre 100). Toma 1-3 minutos. ¿Continuar?')) return
    setAuditing(true); setError(null)
    const r = await fetch('/api/academic/moodle-audit', { method: 'POST' })
    const data = await r.json()
    setAuditing(false)
    if (!r.ok) { setError(data.error ?? 'Error'); return }
    load()
  }

  const visibles = (d?.aulas ?? []).filter(a => {
    if (filtro === 'incumplen') return a.cumple_pesos === false || a.cumple_escala === false
    if (filtro === 'cumplen') return a.cumple_pesos && a.cumple_escala
    if (filtro === 'sin_evaluaciones') return !a.error && a.items_evaluacion === 0
    if (filtro === 'sin_ponderacion') return !a.error && (a.items_evaluacion ?? 0) > 0 && a.suma_pesos == null
    if (filtro === 'sin_datos') return !!a.error
    return true
  })

  // Agrupación por categoría de Moodle
  const grupos = new Map<string, Aula[]>()
  for (const a of visibles) {
    const k = a.categoria ?? '(sin categoría)'
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(a)
  }
  const gruposOrdenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-400">
          {d?.audited_at ? `Última auditoría: ${new Date(d.audited_at).toLocaleString()}` : 'Aún no se ha auditado el campus.'}
        </p>
        <button onClick={audit} disabled={auditing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white">
          {auditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {auditing ? 'Auditando el campus…' : 'Auditar ahora'}
        </button>
      </div>

      {error && <div className="text-sm bg-rose-50 text-rose-700 rounded-lg px-4 py-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {d && d.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button onClick={() => setFiltro('todas')} className={`rounded-lg p-3 text-left border ${filtro === 'todas' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-gray-900">{d.total}</p>
              <p className="text-xs text-gray-500">Aulas</p>
            </button>
            <button onClick={() => setFiltro('cumplen')} className={`rounded-lg p-3 text-left border ${filtro === 'cumplen' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-green-700">{d.cumplen}</p>
              <p className="text-xs text-green-700">Cumplen la política</p>
            </button>
            <button onClick={() => setFiltro('incumplen')} className={`rounded-lg p-3 text-left border ${filtro === 'incumplen' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-rose-700">{d.incumplen}</p>
              <p className="text-xs text-rose-700">Incumplen (pesos {d.pesos_mal} · escala {d.escala_mal})</p>
            </button>
            <button onClick={() => setFiltro('sin_ponderacion')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_ponderacion' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-amber-700">{d.sin_ponderacion}</p>
              <p className="text-xs text-amber-700">Sin ponderación reportada</p>
            </button>
            <button onClick={() => setFiltro('sin_evaluaciones')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_evaluaciones' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-gray-600">{d.sin_evaluaciones}</p>
              <p className="text-xs text-gray-500">Sin evaluaciones (no académicas)</p>
            </button>
            <button onClick={() => setFiltro('sin_datos')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_datos' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-amber-700">{d.sin_datos}</p>
              <p className="text-xs text-amber-700">Sin datos (error)</p>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Aula</th>
                  <th className="text-left px-4 py-3">Vinculada a</th>
                  <th className="text-right px-4 py-3">Recursos (activos/total)</th>
                  <th className="text-right px-4 py-3">Evaluados (activos/total)</th>
                  <th className="text-right px-4 py-3">Con peso</th>
                  <th className="text-right px-4 py-3">Σ pesos activos</th>
                  <th className="text-right px-4 py-3">Escala</th>
                  <th className="text-left px-4 py-3">Política</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gruposOrdenados.map(([cat, aulasGrupo]) => [
                  <tr key={`cat-${cat}`} className="bg-gray-100/80">
                    <td colSpan={8} className="px-4 py-2">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{cat}</span>
                      <span className="text-[11px] text-gray-500 ml-3">
                        {aulasGrupo.length} aula(s)
                        {' · '}<span className="text-green-700">{aulasGrupo.filter(x => x.cumple_pesos && x.cumple_escala).length} cumplen</span>
                        {' · '}<span className="text-rose-700">{aulasGrupo.filter(x => x.cumple_pesos === false || x.cumple_escala === false).length} incumplen</span>
                      </span>
                    </td>
                  </tr>,
                  ...aulasGrupo.map(a => (
                  <tr key={a.aula_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <p className="text-gray-800">{a.shortname}</p>
                      <p className="text-[11px] text-gray-400">#{a.aula_id}{!a.visible ? ' · oculta' : ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[220px] truncate">{a.linked_course ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {a.recursos != null ? <><b className="text-gray-800">{a.recursos_activos ?? '?'}</b><span className="text-gray-400"> / {a.recursos}</span></> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {a.items_evaluacion != null ? <><b className="text-gray-800">{a.items_activos ?? '?'}</b><span className="text-gray-400"> / {a.items_evaluacion}</span></> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{a.items_con_peso ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${a.cumple_pesos === false ? 'text-rose-700' : a.cumple_pesos ? 'text-green-700' : 'text-gray-300'}`}>
                      {a.suma_pesos != null ? `${a.suma_pesos}%` : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${a.cumple_escala === false ? 'text-rose-700 font-medium' : a.cumple_escala ? 'text-green-700' : 'text-gray-300'}`}>
                      {a.escala_total != null ? a.escala_total : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.error
                        ? <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{a.error}</span>
                        : a.items_evaluacion === 0
                          ? <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">sin evaluaciones</span>
                          : (a.cumple_pesos === false || a.cumple_escala === false)
                            ? <span className="text-[11px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">
                              {[a.cumple_pesos === false ? 'pesos ≠ 100%' : null, a.cumple_escala === false ? 'escala ≠ 100' : null].filter(Boolean).join(' · ')}
                            </span>
                            : (a.cumple_pesos && a.cumple_escala)
                              ? <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />cumple</span>
                              : <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">sin ponderación reportada</span>}
                    </td>
                  </tr>
                  )),
                ])}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nada que mostrar con este filtro.</p>}
          </div>

          <div className="text-[11px] text-gray-400 space-y-1">
            <p><b>Auditoría estructural</b>: mide el diseño del aula, tenga o no estudiantes y tenga o no calificaciones. <b>Política</b>: las ponderaciones de los recursos evaluados <b>activos</b> (de primer nivel) suman 100% y el total del curso está sobre 100. Los recursos ocultos no cuentan.</p>
            <p><b>Recursos</b> = módulos del aula (activos / total). <b>Evaluados</b> = con entrada en el libro de calificaciones; <b>con peso</b> = activos que ponderan en la nota.</p>
            <p>Las aulas vacías se leen con la cuenta de servicio &quot;Auditor ERP&quot; (se matricula un instante y se retira). Las aulas se reutilizan entre cohortes: vuelve a auditar tras cada preparación de bloque.</p>
          </div>
        </>
      )}
    </div>
  )
}
