'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users, CheckCircle2, AlertTriangle, ArrowRightCircle } from 'lucide-react'

interface Ref { id: string; name: string }
interface GroupRow {
  id: string; program: string; label: string
  position: number | null; is_last: boolean
  activos: number; completados: number
}
interface Candidate { id: string; label: string }
interface Unplaced {
  student_id: string; name: string; document: string
  program_id: string; program: string; candidates: Candidate[]
}
interface Data {
  categories: Ref[]; groups: GroupRow[]; unplaced: Unplaced[]
  resumen?: { carruseles: number; activos_total: number; activos_en_carrusel: number; sin_carrusel: number }
}

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function CarouselsOverview() {
  const [data, setData] = useState<Data | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(false)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [placing, setPlacing] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function load(cid: string) {
    setLoading(true)
    fetch(`/api/academic/carousels-overview${cid ? `?category_id=${cid}` : ''}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }
  useEffect(() => { load(categoryId) }, [categoryId])

  async function place(u: Unplaced) {
    const key = `${u.student_id}|${u.program_id}`
    const groupId = u.candidates.length === 1 ? u.candidates[0].id : choice[key]
    if (!groupId) return
    setPlacing(prev => ({ ...prev, [key]: true }))
    setNotice(null)
    const res = await fetch('/api/academic/convocatoria-students', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: u.student_id, program_id: u.program_id, group_id: groupId }),
    })
    const d = await res.json()
    setPlacing(prev => ({ ...prev, [key]: false }))
    if (!res.ok || d.error) setNotice({ kind: 'error', text: `${u.name}: ${d.error ?? 'error al colocar'}` })
    else setNotice({ kind: 'ok', text: `${u.name} colocado en ${d.group_label}` })
    load(categoryId)
  }

  // Agrupar carruseles por programa para pintar la secuencia
  const byProgram = new Map<string, GroupRow[]>()
  for (const g of data?.groups ?? []) {
    if (!byProgram.has(g.program)) byProgram.set(g.program, [])
    byProgram.get(g.program)!.push(g)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[280px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría de programas</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {(data?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {data?.resumen && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <b>{data.resumen.carruseles}</b> carruseles
            </span>
            <span className="inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              <b>{data.resumen.activos_en_carrusel}</b> de <b>{data.resumen.activos_total}</b> matrículas activas en carrusel
            </span>
            {data.resumen.sin_carrusel > 0 ? (
              <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <b>{data.resumen.sin_carrusel}</b> sin carrusel (sin acceso a Moodle)
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-700">
                Cobertura completa ✓
              </span>
            )}
          </div>
        )}
      </div>

      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {notice.text}
        </p>
      )}

      {loading && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {!loading && categoryId && byProgram.size === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">Esta categoría no tiene carruseles todavía.</p>
      )}

      {/* Carruseles por programa */}
      {!loading && [...byProgram.entries()].map(([program, rows]) => (
        <div key={program} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-800">{program}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2">Carrusel</th>
                <th className="text-center px-4 py-2 w-32">Secuencia</th>
                <th className="text-right px-4 py-2 w-32">Activos</th>
                <th className="text-right px-4 py-2 w-32">Completaron</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(g => (
                <tr key={g.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <a href={`/academic/groups/${g.id}`} className="text-blue-600 hover:underline">{g.label}</a>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                    {g.position ? `${g.position}º${g.is_last ? ' · último' : ''}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{g.activos}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{g.completados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Activos sin carrusel */}
      {!loading && (data?.unplaced.length ?? 0) > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 border-b border-amber-100 bg-amber-50 text-sm font-semibold text-amber-800">
            ⚠ Activos sin carrusel ({data!.unplaced.length}) — sin acceso a sus aulas Moodle
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2">Estudiante</th>
                <th className="text-left px-4 py-2">Documento</th>
                <th className="text-left px-4 py-2">Programa</th>
                <th className="text-left px-4 py-2 w-72">Colocar en</th>
              </tr>
            </thead>
            <tbody>
              {data!.unplaced.map(u => {
                const key = `${u.student_id}|${u.program_id}`
                return (
                  <tr key={key} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-800">{u.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{u.document}</td>
                    <td className="px-4 py-2.5 text-gray-600">{u.program}</td>
                    <td className="px-4 py-2.5">
                      {u.candidates.length === 0 ? (
                        <span className="text-xs text-gray-400">El programa no tiene carruseles</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {u.candidates.length > 1 && (
                            <select value={choice[key] ?? ''} onChange={e => setChoice(prev => ({ ...prev, [key]: e.target.value }))}
                              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="">Elegir carrusel…</option>
                              {u.candidates.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                          )}
                          {u.candidates.length === 1 && (
                            <span className="flex-1 text-xs text-gray-600 truncate">{u.candidates[0].label}</span>
                          )}
                          <button onClick={() => place(u)}
                            disabled={placing[key] || (u.candidates.length > 1 && !choice[key])}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40">
                            {placing[key] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightCircle className="w-3.5 h-3.5" />}
                            Colocar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
