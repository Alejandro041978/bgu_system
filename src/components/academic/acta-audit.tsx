'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, RefreshCw, Download } from 'lucide-react'

interface Hallazgo {
  asignatura: string; programa: string
  totales: string; actas: number; estudiantes: string; detalle: string
}
interface Data { revisadas: number; actas_mal: number; total: number; hallazgos: Hallazgo[] }

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
    const cab = ['Asignatura', 'Programa', 'Suma', 'Actas', 'Estudiantes', 'Qué pasa']
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cab.map(q).join(',')].concat(data.hallazgos.map(h =>
      [h.asignatura, h.programa, h.totales, h.actas, h.estudiantes, h.detalle].map(q).join(','))).join('\n')
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
          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            <p>
              El Auditor del Campus mira Moodle: que las ponderaciones de un aula sumen 100. Éste mira lo que
              llegó al <strong>expediente</strong>, que no es lo mismo — hay actas heredadas que ningún aula
              respalda, y aulas que se reconfiguraron después de que sus notas ya estaban archivadas.
            </p>
            <p className="text-xs text-gray-400">
              Un solo contraste, y a propósito. La primera versión también marcaba las asignaturas cuyas
              evaluaciones pesan distinto entre actas: eran 89, y al abrirlas todas sumaban 100. Son cursos
              rediseñados entre cohortes —168 de 284 asignaturas tienen más de un diseño—, no errores. Un
              reporte que llama error a lo normal enseña a no leerlo.
            </p>
          </div>
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
        <p className="text-xs text-gray-400 mt-3">
          {data.revisadas.toLocaleString()} actas con evaluaciones revisadas · {data.actas_mal} no suman 100
        </p>
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Todas las actas suman 100.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-red-50 text-red-800 border-red-200">
            <p className="text-sm font-semibold">Las ponderaciones no suman 100 · {data.total} asignaturas</p>
            <p className="text-xs mt-0.5 opacity-90">
              La nota final se calcula sobre una base que no es la del reglamento. Va agrupado por asignatura:
              una lista de nombres no se arregla nombre por nombre, se arregla en el aula.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Asignatura</th>
                  <th className="text-left px-3 py-2 font-medium">Suma</th>
                  <th className="text-right px-3 py-2 font-medium">Actas</th>
                  <th className="text-left px-3 py-2 font-medium">Estudiantes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.hallazgos.map((h, i) => (
                  <tr key={`${h.asignatura}-${i}`} className="hover:bg-gray-50/60 align-top">
                    <td className="px-3 py-2.5">
                      <p className="text-gray-800">{h.asignatura}</p>
                      <p className="text-[11px] text-gray-400">{h.programa}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-semibold text-red-700">{h.totales}</span>
                      <p className="text-[11px] text-gray-400 max-w-[380px]">{h.detalle}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{h.actas}</td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-500 max-w-[280px]">{h.estudiantes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
