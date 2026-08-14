'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, RefreshCw, Download } from 'lucide-react'

interface Hallazgo {
  tipo: 'descuadrada' | 'peso_incoherente' | 'conteo_variable'
  asignatura: string; programa: string; evaluacion: string
  mayoria: string; minoria: string; actas: number; detalle: string
}
interface Data {
  revisadas: number; total: number
  por_tipo: { descuadrada: number; peso_incoherente: number; conteo_variable: number }
  hallazgos: Hallazgo[]
}

const TIPO: Record<Hallazgo['tipo'], { label: string; cls: string; explica: string }> = {
  descuadrada: {
    label: 'No suma 100', cls: 'bg-red-50 text-red-800 border-red-200',
    explica: 'Las ponderaciones del acta no suman 100 después de normalizar. La nota final se calcula sobre una base que no es la que dice el reglamento.',
  },
  peso_incoherente: {
    label: 'Peso incoherente', cls: 'bg-amber-50 text-amber-800 border-amber-200',
    explica: 'La misma evaluación pesa distinto en actas de la misma asignatura. Casi siempre son una o dos actas frente a cientos: eso no es un rediseño, es un error de una.',
  },
  conteo_variable: {
    label: 'Cantidad variable', cls: 'bg-violet-50 text-violet-800 border-violet-200',
    explica: 'El número de evaluaciones de un tipo cambia entre actas de la misma asignatura. Puede ser un rediseño del curso —y entonces es historia— o una importación incompleta.',
  },
}

export function ActaAudit() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/academic/acta-audit')
      const d = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}` }))
      if (!r.ok || d.error) { setError(d.error ?? 'Error'); return }
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function exportar() {
    if (!data?.hallazgos.length) return
    const cab = ['Tipo', 'Asignatura', 'Programa', 'Evaluación', 'Lo habitual', 'La desviación', 'Actas afectadas']
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cab.map(q).join(',')].concat(data.hallazgos.map(h =>
      [TIPO[h.tipo].label, h.asignatura, h.programa, h.evaluacion, h.mayoria, h.minoria, h.actas].map(q).join(','))).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'auditor-actas.csv'
    a.click()
  }

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!data) return null

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            El Auditor del Campus mira Moodle: que las ponderaciones de un aula sumen 100. Éste mira lo que
            llegó al expediente, que no es lo mismo — hay actas heredadas que ningún aula respalda, y aulas que
            se reconfiguraron después de que sus notas ya estaban archivadas. Cada asignatura se compara
            <strong> consigo misma</strong>: no hay tabla de patrones que mantener, y una desviación de una sola
            acta frente a trescientas iguales se ve sin que nadie declare cuál era el patrón.
          </p>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={load} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
              <RefreshCw className="w-3.5 h-3.5" /> Revisar
            </button>
            {!!data.hallazgos.length && (
              <button onClick={exportar} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
                <Download className="w-3.5 h-3.5" /> Excel
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">{data.revisadas.toLocaleString()} actas con evaluaciones revisadas.</p>
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Sin contradicciones: todas las actas suman 100 y cada asignatura
          se comporta igual en todas.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(['descuadrada', 'peso_incoherente', 'conteo_variable'] as const).map(t => data.por_tipo[t] > 0 && (
              <span key={t} className={`text-xs px-2.5 py-1 rounded-full border ${TIPO[t].cls}`}>
                {data.por_tipo[t]} · {TIPO[t].label}
              </span>
            ))}
          </div>

          {(['descuadrada', 'peso_incoherente', 'conteo_variable'] as const).map(t => {
            const items = data.hallazgos.filter(h => h.tipo === t)
            if (!items.length) return null
            return (
              <div key={t} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className={`px-4 py-3 border-b ${TIPO[t].cls}`}>
                  <p className="text-sm font-semibold">{TIPO[t].label} · {items.length}</p>
                  <p className="text-xs mt-0.5 opacity-90">{TIPO[t].explica}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Asignatura</th>
                        <th className="text-left px-3 py-2 font-medium">Evaluación</th>
                        <th className="text-left px-3 py-2 font-medium">Lo habitual</th>
                        <th className="text-left px-3 py-2 font-medium">La desviación</th>
                        <th className="text-right px-3 py-2 font-medium">Actas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {items.map((h, i) => (
                        <tr key={`${h.asignatura}-${h.evaluacion}-${i}`} className="hover:bg-gray-50/60 align-top">
                          <td className="px-3 py-2.5">
                            <p className="text-gray-800">{h.asignatura}</p>
                            <p className="text-[11px] text-gray-400">{h.programa}</p>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-600">{h.evaluacion}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{h.mayoria}</td>
                          <td className="px-3 py-2.5 text-xs font-medium text-gray-800">{h.minoria}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{h.actas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
