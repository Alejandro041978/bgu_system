'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Search, Ban } from 'lucide-react'

interface Libre {
  aula_id: number
  shortname: string | null
  matriculados: number
  code: string | null
  sufijo: string | null
  propuesta: string | null
  programa: string | null
  confianza: 'alta' | 'media' | 'ninguna'
  familia: string | null
  motivo: string
  identificada: boolean
  no_curricular: boolean
}

const num = (n: number) => n.toLocaleString('es-PE')

const FAMILIA: Record<string, string> = {
  no_es_asignatura: 'No parece una asignatura',
  codigo_desconocido: 'Su código no existe en ninguna malla',
  codigo_ambiguo: 'El código no basta para elegir',
}

export function ClassroomFree() {
  const [aulas, setAulas] = useState<Libre[]>([])
  const [tot, setTot] = useState({ total: 0, con_alumnos: 0, matriculas: 0, identificadas: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [soloConAlumnos, setSoloConAlumnos] = useState(false)
  const [familia, setFamilia] = useState('')

  const traer = async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/academic/moodle-links?vista=libres', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setAulas(j.aulas ?? [])
      setTot({ total: j.total ?? 0, con_alumnos: j.con_alumnos ?? 0, matriculas: j.matriculas ?? 0, identificadas: j.identificadas ?? 0 })
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  const texto = q.trim().toLowerCase()
  const lista = aulas.filter(a =>
    (!soloConAlumnos || a.matriculados > 0) &&
    (!familia || a.familia === familia) &&
    (!texto || String(a.aula_id).includes(texto) || String(a.shortname ?? '').toLowerCase().includes(texto)))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Aulas libres', tot.total],
          ['Con alumnos dentro', tot.con_alumnos],
          ['Matrículas en juego', tot.matriculas],
          ['Ya identificadas', tot.identificadas],
        ].map(([t, v]) => (
          <div key={String(t)} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{num(Number(v))}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o número de aula…"
            className="w-80 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={familia} onChange={e => setFamilia(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todas</option>
          {Object.entries(FAMILIA).map(([k, v]) => (
            <option key={k} value={k}>{v} ({aulas.filter(a => a.familia === k).length})</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soloConAlumnos} onChange={e => setSoloConAlumnos(e.target.checked)} />
          Solo con alumnos dentro
        </label>
        <button onClick={traer} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
        </button>
        <span className="text-sm text-slate-500">{num(lista.length)} de {num(aulas.length)}</span>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Aula</th>
              <th className="px-3 py-2 text-right">Alumnos</th>
              <th className="px-3 py-2">Asignatura que parece enseñar</th>
              <th className="px-3 py-2">Por qué sigue libre</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(a => (
              <tr key={a.aula_id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-slate-500">{a.aula_id}</span>
                  <span className="ml-2 text-slate-800">{a.shortname}</span>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${a.matriculados > 0 ? 'font-medium text-slate-800' : 'text-slate-300'}`}>
                  {a.matriculados > 0 ? num(a.matriculados) : '—'}
                </td>
                <td className="px-3 py-2">
                  {a.propuesta
                    ? <>
                        <span className="text-slate-800">{a.propuesta}</span>
                        {a.programa && <span className="block text-xs text-slate-400">{a.programa}</span>}
                      </>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {a.no_curricular
                    ? <span className="inline-flex items-center gap-1 text-slate-500"><Ban className="h-3 w-3" /> marcada como no curricular</span>
                    : a.familia
                      ? <span className="text-amber-700">{FAMILIA[a.familia] ?? a.familia}</span>
                      : <span className="text-slate-500">Identificada, falta ponerla en una colección</span>}
                </td>
              </tr>
            ))}
            {!lista.length && !cargando && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                No queda ninguna aula libre con ese filtro.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
