'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users } from 'lucide-react'

interface Ref { id: string; name: string }
interface Conv { id: string; name: string; semester: string; first_day: string | null }
interface Row { name: string; document: string; situation: string | null; programs: string[]; fecha: string | null }
interface Data { matriculas: number; estudiantes: number; por_programa: { programa: string; n: number }[]; rows: Row[] }

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

const SIT_STYLE: Record<string, string> = {
  activo: 'bg-green-50 text-green-700',
  egresado: 'bg-blue-50 text-blue-700',
  IW: 'bg-red-50 text-red-600',
  LOA: 'bg-amber-50 text-amber-700',
}

export function ConvocatoriaStudents() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [convs, setConvs] = useState<Conv[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [convId, setConvId] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetch('/api/convocatorias').then(r => r.json()).then(d => {
      setCategories(d.categories ?? []); setYears(d.years ?? [])
      if ((d.years ?? []).length) setYearId(d.years[0].id)
    })
  }, [])

  // Convocatorias de la categoría en el año elegido (mismo endpoint de Gestión)
  useEffect(() => {
    setConvs([]); setConvId(''); setData(null)
    if (!categoryId || !yearId) return
    fetch(`/api/convocatorias?category_id=${categoryId}&year_id=${yearId}`)
      .then(r => r.json()).then(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const flat: Conv[] = (d.semesters ?? []).flatMap((s: any) =>
          (s.convocatorias ?? []).map((c: { id: string; name: string; first_day: string | null }) => ({
            id: c.id, name: c.name, semester: s.name, first_day: c.first_day,
          })))
        setConvs(flat)
      })
  }, [categoryId, yearId])

  useEffect(() => {
    setData(null); setFilter('')
    if (!convId) return
    setLoading(true)
    fetch(`/api/academic/convocatoria-students?convocatoria_id=${convId}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [convId])

  const visible = data?.rows.filter(r => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return r.name.toLowerCase().includes(q) || r.document.includes(q) || r.programs.some(p => p.toLowerCase().includes(q))
  }) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="min-w-[160px]">
          <span className="block text-xs text-gray-500 mb-1">Año académico</span>
          <select value={yearId} onChange={e => setYearId(e.target.value)} className={inp}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[240px]">
          <span className="block text-xs text-gray-500 mb-1">Convocatoria</span>
          <select value={convId} onChange={e => setConvId(e.target.value)} className={inp} disabled={!convs.length}>
            <option value="">{categoryId ? (convs.length ? 'Seleccionar…' : 'Sin convocatorias en este año') : 'Elige categoría y año'}</option>
            {convs.map(c => <option key={c.id} value={c.id}>{c.name} — {c.semester} ({fdate(c.first_day)})</option>)}
          </select>
        </label>
      </div>

      {loading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && (
        <>
          {/* Parte intermedia: sumas de estudiantes por programa */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Matrículas por programa en esta convocatoria</p>
            {data.por_programa.length === 0 ? (
              <p className="text-sm text-gray-400">Sin matrículas asociadas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.por_programa.map(p => (
                  <span key={p.programa} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-gray-700">{p.programa}</span>
                    <span className="font-bold text-blue-700">{p.n}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-sm">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-blue-800">{data.estudiantes} estudiantes · {data.matriculas} matrículas</span>
                </span>
              </div>
            )}
          </div>

          {/* Parte inferior: tabla de estudiantes */}
          {data.rows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-700">Estudiantes ({visible.length}{filter ? ` de ${data.rows.length}` : ''})</p>
                <input
                  value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Buscar nombre, documento o programa…"
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Estudiante</th>
                      <th className="text-left px-3 py-3">Documento</th>
                      <th className="text-left px-3 py-3">Programas</th>
                      <th className="text-left px-3 py-3">Situación</th>
                      <th className="text-left px-3 py-3">Fecha matrícula</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visible.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{r.document}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {r.programs.map(p => (
                              <span key={p} className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full">{p}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {r.situation ? (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${SIT_STYLE[r.situation] ?? 'bg-gray-100 text-gray-500'}`}>{r.situation}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{fdate(r.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'
