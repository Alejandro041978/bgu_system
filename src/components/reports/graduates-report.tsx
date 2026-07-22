'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, GraduationCap, Award, Users } from 'lucide-react'

interface Ref { id: string; name: string; category_id?: string }
interface Row {
  id: string; name: string; document: string; email: string | null
  program: string; category: string; status: string
  egreso: string | null; titulado_at: string | null; avance: string
}
interface Data {
  categories: Ref[]; programs: Ref[]
  resumen: { total: number; egresados: number; titulados: number }
  rows: Row[]
}

const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

export function GraduatesReport() {
  const [data, setData] = useState<Data | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [programId, setProgramId] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (categoryId) params.set('category_id', categoryId)
    if (programId) params.set('program_id', programId)
    if (status) params.set('status', status)
    fetch(`/api/reports/graduates?${params}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [categoryId, programId, status])
  useEffect(() => { load() }, [load])

  const programsOfCat = (data?.programs ?? []).filter(p => !categoryId || p.category_id === categoryId)
  const visible = (data?.rows ?? []).filter(r => {
    if (!q) return true
    const s = q.toLowerCase()
    return r.name.toLowerCase().includes(s) || r.document.includes(s) || (r.email ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[220px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setProgramId('') }} className={inp}>
            <option value="">Todas</option>
            {(data?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="min-w-[260px]">
          <span className="block text-xs text-gray-500 mb-1">Programa</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp}>
            <option value="">Todos</option>
            {programsOfCat.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          <span className="block text-xs text-gray-500 mb-1">Estado</span>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inp}>
            <option value="">Todos</option>
            <option value="pendiente">Egresados (sin título)</option>
            <option value="titulado">Titulados</option>
          </select>
        </label>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar nombre, documento o correo…" className={`${inp} ml-auto w-72`} />
      </div>

      {data && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm">
            <Users className="w-4 h-4 text-gray-400" /> <b>{data.resumen.total}</b> egresos
          </span>
          <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-800">
            <GraduationCap className="w-4 h-4" /> <b>{data.resumen.egresados}</b> egresados sin título
          </span>
          <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-700">
            <Award className="w-4 h-4" /> <b>{data.resumen.titulados}</b> titulados
          </span>
        </div>
      )}

      {loading && !data && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Estudiante</th>
                <th className="text-left px-3 py-3">Documento</th>
                <th className="text-left px-3 py-3">Programa</th>
                <th className="text-left px-3 py-3">Categoría</th>
                <th className="text-center px-3 py-3">Malla</th>
                <th className="text-left px-3 py-3">Egreso</th>
                <th className="text-left px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Sin egresados para estos filtros.</td></tr>
              )}
              {visible.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <span className="text-gray-800">{r.name}</span>
                    {r.email && <span className="block text-[11px] text-gray-400">{r.email}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{r.document}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.program}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{r.category}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">{r.avance}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fdate(r.egreso)}</td>
                  <td className="px-3 py-2.5">
                    {r.status === 'titulado' ? (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] px-2 py-0.5 rounded-full">
                        <Award className="w-3 h-3" /> Titulado {r.titulado_at ? `· ${fdate(r.titulado_at)}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[11px] px-2 py-0.5 rounded-full">
                        <GraduationCap className="w-3 h-3" /> Egresado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Egresado = completó todas las asignaturas de su malla (detección automática); pasa a Titulado cuando se emite su título. La columna Malla muestra asignaturas cubiertas/total al momento de la detección.
      </p>
    </div>
  )
}
