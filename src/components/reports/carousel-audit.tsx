'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, X } from 'lucide-react'

interface Persona { student_id: string; name: string; document: string | null; colocado: string | null; detalle: string | null; desfase: boolean }
interface Celda { n: number; desfasados: number; personas: Persona[] }
interface Programa {
  program_id: string; name: string; partner_campus: boolean; cadenas: number
  columns: { group_id: string; label: string; name: string | null; asignaturas: number }[]
  extra_columns: number
  matriculados: number
  sin_carrusel: Celda
  cells: Record<string, Celda>
  egresados: Celda
}

const MAX = 6

export function CarouselAudit() {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [cat, setCat] = useState('')
  const [data, setData] = useState<{ category: string | null; programs: Programa[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<{ titulo: string; celda: Celda } | null>(null)

  useEffect(() => {
    fetch('/api/reports/carousel-audit?meta=1').then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setCategories(d.categories ?? []); if (d.categories?.length) setCat(d.categories[0].id) } })
      .catch(() => setError('No se pudieron cargar las categorías'))
  }, [])

  useEffect(() => {
    if (!cat) return
    setLoading(true); setError(null); setData(null); setAbierta(null)
    fetch(`/api/reports/carousel-audit?category_id=${cat}`).then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false) })
      .catch(() => { setError('No se pudo calcular'); setLoading(false) })
  }, [cat])

  const programas = data?.programs ?? []
  const tot = programas.reduce((t, p) => ({
    mat: t.mat + p.matriculados, sin: t.sin + p.sin_carrusel.n, egr: t.egr + p.egresados.n,
    des: t.des + p.sin_carrusel.desfasados + p.egresados.desfasados + Object.values(p.cells).reduce((s, c) => s + c.desfasados, 0),
  }), { mat: 0, sin: 0, egr: 0, des: 0 })

  const Cell = ({ celda, titulo, label, className = '' }: { celda: Celda; titulo: string; label?: string; className?: string }) => (
    <td className={`px-3 py-2 text-center align-top ${className}`}>
      <button onClick={() => celda.n && setAbierta({ titulo, celda })} disabled={!celda.n}
        className={`inline-flex flex-col items-center rounded-lg px-2 py-1 min-w-[64px] ${celda.n ? 'hover:bg-blue-50' : 'opacity-40'}`}>
        {label && <span className="text-[11px] font-mono text-gray-500">{label}</span>}
        <span className="text-sm font-semibold tabular-nums text-gray-800">{celda.n}</span>
        {celda.desfasados > 0 && <span className="text-[10px] text-amber-700 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{celda.desfasados} desfase</span>}
      </button>
    </td>
  )

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Categoría</label>
        <select value={cat} onChange={e => setCat(e.target.value)} disabled={loading}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        {data && !loading && (
          <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
            <span><b className="text-gray-800">{tot.mat}</b> matriculados activos</span>
            <span><b className="text-gray-800">{tot.sin}</b> sin carrusel</span>
            <span><b className="text-gray-800">{tot.egr}</b> egresados por regla</span>
            <span className={tot.des ? 'text-amber-700' : ''}><b>{tot.des}</b> desfasados</span>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Programa</th>
                <th className="px-3 py-2 text-center">Matriculados</th>
                <th className="px-3 py-2 text-center">Sin carrusel</th>
                {Array.from({ length: MAX }, (_, i) => <th key={i} className="px-3 py-2 text-center">Carrusel {i + 1}</th>)}
                <th className="px-3 py-2 text-center">Egresados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!loading && programas.length === 0 && (
                <tr><td colSpan={MAX + 4} className="px-4 py-8 text-center text-gray-400">Sin programas en esta categoría.</td></tr>
              )}
              {programas.map(p => (
                <tr key={p.program_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 align-top">
                    <div className="text-gray-800">{p.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {p.columns.length} carrusel{p.columns.length === 1 ? '' : 'es'}{p.cadenas > 1 ? ` · ${p.cadenas} cadenas` : ''}
                      {p.partner_campus ? ' · campus externo' : ''}
                      {p.extra_columns > 0 && <span className="text-amber-700"> · {p.extra_columns} más no mostrados</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center align-top"><span className="text-sm font-semibold tabular-nums text-gray-800">{p.matriculados}</span></td>
                  <Cell celda={p.sin_carrusel} titulo={`${p.name} · Sin carrusel`} className={p.sin_carrusel.n ? 'bg-amber-50/40' : ''} />
                  {Array.from({ length: MAX }, (_, i) => {
                    const col = p.columns[i]
                    if (!col) return <td key={i} className="px-3 py-2 text-center text-gray-200">—</td>
                    return <Cell key={col.group_id} celda={p.cells[col.group_id]} titulo={`${p.name} · ${col.label}${col.name ? ` · ${col.name}` : ''}`} label={col.label} />
                  })}
                  <Cell celda={p.egresados} titulo={`${p.name} · Egresados por regla`} className={p.egresados.n ? 'bg-blue-50/40' : ''} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          La posición se calcula desde las notas: se avanza de carrusel solo con todas sus asignaturas aprobadas, convalidadas o validadas.
          "Desfase" = colocado en un carrusel distinto del que le toca por regla. Matriculados = sin carrusel + carruseles + egresados.
        </p>
      </div>

      {abierta && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800">{abierta.titulo} <span className="text-gray-400 font-normal">· {abierta.celda.n}</span></p>
            <button onClick={() => setAbierta(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Estudiante</th>
                <th className="px-4 py-2 text-left">Documento</th>
                <th className="px-4 py-2 text-left">Colocado en</th>
                <th className="px-4 py-2 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {abierta.celda.personas.map(x => (
                <tr key={x.student_id} className={x.desfase ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-1.5"><a href={`/academic/students?id=${x.student_id}`} className="text-blue-600 hover:underline">{x.name}</a></td>
                  <td className="px-4 py-1.5 text-gray-500 font-mono text-xs">{x.document ?? '—'}</td>
                  <td className="px-4 py-1.5 text-gray-600 font-mono text-xs">{x.colocado ?? '—'}</td>
                  <td className={`px-4 py-1.5 text-xs ${x.desfase ? 'text-amber-700' : 'text-gray-500'}`}>{x.detalle ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
