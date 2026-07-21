'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type Cell = { matriculados: number; egresados: number; titulados: number; retirados: number; reentry: number; activos: number; campus_socio: number; carrusel: number; moodle: number }
type Row = Cell & { category: string; sigla: string }
type Data = { rows: Row[]; total: Cell }

const COLS: { key: keyof Cell; label: string; cls: string }[] = [
  { key: 'matriculados', label: 'Matriculados', cls: 'text-gray-900 font-semibold' },
  { key: 'egresados',    label: 'Egresados',    cls: 'text-blue-700' },
  { key: 'titulados',    label: 'Titulados',    cls: 'text-amber-700' },
  { key: 'retirados',    label: 'Retirados', cls: 'text-rose-700' },
  { key: 'reentry',      label: 'Reentry', cls: 'text-emerald-700' },
  { key: 'activos',      label: 'Activos',      cls: 'text-green-700' },
  { key: 'campus_socio', label: 'Campus socio', cls: 'text-violet-700' },
  { key: 'carrusel',     label: 'Carrusel', cls: 'text-cyan-700' },
  { key: 'moodle',       label: 'Moodle', cls: 'text-indigo-700' },
]

export function StudentStatusReport() {
  const [d, setD] = useState<Data | null>(null)
  useEffect(() => { fetch('/api/reports/student-status').then(r => r.json()).then(setD) }, [])

  if (!d) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
  if ('error' in d) return <p className="text-sm text-red-500">{String((d as { error: string }).error)}</p>

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Categoría</th>
              {COLS.map(c => <th key={c.key} className="text-right px-4 py-3">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {d.rows.map(r => (
              <tr key={r.category} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-gray-700 font-medium" title={r.category}>{r.sigla}</td>
                {COLS.map(c => (
                  <td key={c.key} className={`px-4 py-2.5 text-right ${r[c.key] ? c.cls : 'text-gray-300'}`}>
                    {r[c.key].toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-4 py-3 text-gray-800">Total</td>
              {COLS.map(c => (
                <td key={c.key} className={`px-4 py-3 text-right ${c.cls}`}>{d.total[c.key].toLocaleString()}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-[11px] text-gray-400 space-y-1">
        <p>La unidad es la <b>matrícula</b> (estudiante × programa): quien cursa dos programas cuenta en ambos, y cada matrícula tiene su propio estado. Quien se tituló de su maestría y hoy cursa el doctorado es titulado en Master Program y activo en Doctoral Program.</p>
        <p><b>Matriculados</b> = Egresados + Titulados + Retirados + Activos + Campus socio (cada matrícula en un solo estado).</p>
        <p><b>Egresados</b> son matrículas terminadas cuyo título aún no se emite; al emitirse pasan a <b>Titulados</b>. Los dos juntos son el total de programas completados.</p>
        <p><b>Reentry</b> se muestra aparte (no suma): matrículas activas de estudiantes que se retiraron y volvieron.</p>
        <p><b>Carrusel</b> y <b>Moodle</b> miden cobertura sobre los <b>Activos</b>: cuántos ya están colocados en un carrusel (lo que da acceso a sus aulas) y cuántos tienen cuenta Moodle. Lo ideal: ambos iguales a Activos.</p>
        <p>{d.rows.map(r => `${r.sigla} = ${r.category}`).join(' · ')}</p>
      </div>
    </div>
  )
}
