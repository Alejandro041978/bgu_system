'use client'

import { useEffect, useState } from 'react'
import { Loader2, CalendarDays } from 'lucide-react'

interface Program { id: string; name: string; category: string }
interface Ref { id: string; name: string }
interface Row {
  id: string; name: string; semester: string
  first_day: string | null; deadline_date: string | null
  matriculas_programa: number; matriculas_total: number
}
interface Data { program: { id: string; name: string }; rows: Row[]; sin_convocatoria: number; total_programa: number }

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

export function ConvocatoriasReport() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [programId, setProgramId] = useState('')
  const [yearId, setYearId] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/academic/convocatorias-report').then(r => r.json()).then(d => {
      setPrograms(d.programs ?? []); setYears(d.years ?? [])
      if ((d.years ?? []).length) setYearId(d.years[0].id)
    })
  }, [])

  useEffect(() => {
    setData(null)
    if (!programId || !yearId) return
    setLoading(true)
    fetch(`/api/academic/convocatorias-report?program_id=${programId}&year_id=${yearId}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [programId, yearId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[240px]">
          <span className="block text-xs text-gray-500 mb-1">Programa</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.category ? ` — ${p.category}` : ''}</option>)}
          </select>
        </label>
        <label className="min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Año académico</span>
          <select value={yearId} onChange={e => setYearId(e.target.value)} className={inp}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
      </div>

      {loading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
              {data.total_programa} matrículas del programa en este año
            </span>
            {data.sin_convocatoria > 0 && (
              <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
                ⚠ {data.sin_convocatoria} matrículas del programa SIN convocatoria asignada (todas las épocas)
              </span>
            )}
          </div>

          {data.rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No hay convocatorias de la categoría de este programa en el año elegido.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Convocatoria</th>
                    <th className="text-left px-3 py-3">Semestre</th>
                    <th className="text-left px-3 py-3">Cierre matrícula</th>
                    <th className="text-left px-3 py-3">Primer día</th>
                    <th className="text-right px-4 py-3">Matrículas ({data.program.name.length > 24 ? 'programa' : data.program.name})</th>
                    <th className="text-right px-4 py-3">Todos los programas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.rows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-800"><span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-gray-300" />{r.name}</span></td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{r.semester}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{fdate(r.deadline_date)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{fdate(r.first_day)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${r.matriculas_programa ? 'text-blue-700' : 'text-gray-300'}`}>{r.matriculas_programa}</td>
                      <td className={`px-4 py-2.5 text-right ${r.matriculas_total ? 'text-gray-600' : 'text-gray-300'}`}>{r.matriculas_total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td colSpan={4} className="px-4 py-2.5 text-gray-800">Total del año</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{data.total_programa}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{data.rows.reduce((s, r) => s + r.matriculas_total, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            Se muestran las convocatorias de la <b>categoría</b> del programa (las convocatorias son por categoría). &quot;Todos los programas&quot; suma las matrículas de la convocatoria en cualquier programa de la categoría.
          </p>
        </>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
