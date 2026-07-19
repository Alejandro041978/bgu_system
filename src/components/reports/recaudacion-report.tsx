'use client'

import { useEffect, useState } from 'react'
import { Loader2, Banknote } from 'lucide-react'

interface Data {
  years: number[]; year: number
  columns: string[]
  column_labels?: string[]
  rows: { month: number; cells: number[]; total: number; count: number }[]
  column_totals: number[]
  total: number
  payments: number
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const fmt = (n: number) => n === 0 ? '—' : n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function RecaudacionReport() {
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/reports/recaudacion').then(r => r.json()).then(d => {
      setYears(d.years ?? [])
      if (d.year) setYear(d.year)
    })
  }, [])

  useEffect(() => {
    if (!year) return
    setLoading(true); setData(null)
    fetch(`/api/reports/recaudacion?year=${year}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [year])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="min-w-[140px]">
          <span className="block text-xs text-gray-500 mb-1">Año calendario</span>
          <select value={year ?? ''} onChange={e => setYear(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {data && (
          <div className="flex flex-wrap gap-2 text-xs pt-5">
            <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-800 px-3 py-1.5 rounded-full font-medium">
              <Banknote className="w-3.5 h-3.5" /> Total {data.year}: {fmt(data.total)}
            </span>
            <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full">{data.payments.toLocaleString('es-PE')} pagos</span>
          </div>
        )}
      </div>

      {loading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 sticky left-0 bg-gray-50">Mes</th>
                  {data.columns.map((c, i) => (
                    <th key={c} className="text-right px-4 py-3" title={c}>{data.column_labels?.[i] ?? c}</th>
                  ))}
                  <th className="text-right px-4 py-3 border-l border-gray-200">Total mes</th>
                  <th className="text-right px-4 py-3">Pagos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.rows.map(r => (
                  <tr key={r.month} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-700 font-medium sticky left-0 bg-white">{MESES[r.month - 1]}</td>
                    {r.cells.map((v, i) => (
                      <td key={i} className={`px-4 py-2.5 text-right tabular-nums ${v ? 'text-gray-800' : 'text-gray-300'}`}>{fmt(v)}</td>
                    ))}
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold border-l border-gray-100 ${r.total ? 'text-blue-700' : 'text-gray-300'}`}>{fmt(r.total)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-xs ${r.count ? 'text-gray-500' : 'text-gray-300'}`}>{r.count || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5 text-gray-800 sticky left-0 bg-gray-50">Total</td>
                  {data.column_totals.map((v, i) => (
                    <td key={i} className="px-4 py-2.5 text-right tabular-nums text-gray-800">{fmt(v)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700 border-l border-gray-200">{fmt(data.total)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-500">{data.payments.toLocaleString('es-PE')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {data && (
        <p className="text-[11px] text-gray-400">
          Todos los pagos recibidos (cualquier concepto), por fecha de pago. La categoría se resuelve por la cuota pagada → matrícula → programa; si la cuota no lo permite, por la convocatoria de la cuota o el programa único del estudiante. &quot;Sin categoría&quot; agrupa lo que no se pudo atribuir.
        </p>
      )}
    </div>
  )
}
