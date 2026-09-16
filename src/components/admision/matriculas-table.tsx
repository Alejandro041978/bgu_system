'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Tabla de matrículas por programa con las sub-filas por convocatoria/semestre
// ocultables (pedido del usuario, 16/09/2026): un botón alterna entre el detalle
// completo y la vista solo a nivel de programa. La preferencia se recuerda en
// el navegador.
interface Conv { label: string; sem: string | null; count: number }
interface Program { id: string; name: string; code: string | null; count: number; convs: Conv[] }

const CLAVE = 'matriculas:detalle'

export function MatriculasTable({ rows, total }: { rows: Program[]; total: number }) {
  const [detalle, setDetalle] = useState<boolean>(() => {
    try { return localStorage.getItem(CLAVE) !== 'oculto' } catch { return true }
  })
  const alternar = () => {
    setDetalle(d => {
      try { localStorage.setItem(CLAVE, d ? 'oculto' : 'visible') } catch { /* sin almacenamiento */ }
      return !d
    })
  }
  const subfilas = rows.reduce((n, p) => n + p.convs.length, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 bg-white">
        <p className="text-xs text-gray-400">
          {detalle ? `Detalle por convocatoria y semestre (${subfilas} filas)` : 'Solo totales por programa'}
        </p>
        <button onClick={alternar}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 border border-blue-200 hover:bg-blue-50 rounded-lg px-3 py-1.5">
          {detalle ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {detalle ? 'Ocultar semestres' : 'Mostrar semestres'}
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-5 py-3 font-semibold text-gray-600">{detalle ? 'Programa / Convocatoria' : 'Programa'}</th>
            <th className="text-left px-5 py-3 font-semibold text-gray-600">Código</th>
            <th className="text-right px-5 py-3 font-semibold text-gray-600">Matriculados</th>
            <th className="text-right px-5 py-3 font-semibold text-gray-600">% del total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(program => {
            const pct = total > 0 ? ((program.count / total) * 100).toFixed(1) : '0.0'
            return (
              <Fragment key={program.id}>
                <tr className="border-t border-gray-100 bg-gray-50/60">
                  <td className="px-5 py-3 font-semibold text-gray-800">{program.name}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{program.code ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs">
                      {program.count}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-gray-600">{pct}%</td>
                </tr>
                {detalle && program.convs.map((cv, j) => {
                  const cpct = total > 0 ? ((cv.count / total) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={program.id + '-' + j} className="border-t border-gray-50">
                      <td className="pl-10 pr-5 py-2 text-gray-600 text-[13px]">
                        ↳ {cv.sem && <span className="text-indigo-500 font-medium">{cv.sem} · </span>}{cv.label}
                      </td>
                      <td className="px-5 py-2"></td>
                      <td className="px-5 py-2 text-right">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium text-xs">
                          {cv.count}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-right text-gray-400 text-xs">{cpct}%</td>
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-gray-400 py-10">Sin matrículas para el período seleccionado</p>
      )}
    </div>
  )
}
