'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'

interface Libre {
  program_id: string; programa: string
  categoria: string | null; category_id: string | null
  asignaturas: number; estudiantes: number
}
interface Externo { program_id: string; programa: string; categoria: string | null }

const num = (n: number) => n.toLocaleString('es-PE')

export function ProgramFree() {
  const [programas, setProgramas] = useState<Libre[]>([])
  const [externos, setExternos] = useState<Externo[]>([])
  const [tot, setTot] = useState({ total: 0, con_estudiantes: 0, estudiantes: 0, excluidos: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoria, setCategoria] = useState('')
  const [verExternos, setVerExternos] = useState(false)

  const traer = async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/academic/moodle-collections?vista=programas-libres', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setProgramas(j.programas ?? [])
      setExternos(j.campus_externo ?? [])
      setTot({
        total: j.total ?? 0, con_estudiantes: j.con_estudiantes ?? 0,
        estudiantes: j.estudiantes ?? 0, excluidos: j.excluidos_campus_externo ?? 0,
      })
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  const lista = programas.filter(p => !categoria || (categoria === '__sin' ? !p.category_id : p.category_id === categoria))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Programas sin colección', tot.total],
          ['Con estudiantes matriculados', tot.con_estudiantes],
          ['Estudiantes afectados', tot.estudiantes],
          ['Excluidos por campus externo', tot.excluidos],
        ].map(([t, v], i) => (
          <div key={String(t)} className={`rounded-lg border p-4 ${i === 1 && Number(v) > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{t}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{num(Number(v))}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={categoria} onChange={e => setCategoria(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todas las categorías ({programas.length})</option>
          {[...new Map(programas.filter(p => p.category_id).map(p => [p.category_id!, p.categoria ?? p.category_id!])).entries()]
            .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
            .map(([id, nombre]) => (
              <option key={id} value={id}>{nombre} ({programas.filter(p => p.category_id === id).length})</option>
            ))}
          {programas.some(p => !p.category_id) && (
            <option value="__sin">Sin categoría ({programas.filter(p => !p.category_id).length})</option>
          )}
        </select>
        <button onClick={traer} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
        </button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {tot.con_estudiantes > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Hay <strong>{num(tot.con_estudiantes)}</strong> programas con estudiantes matriculados y sin ninguna colección.
          Esas matrículas no pueden entrar a ninguna aula, y Nueva Matrícula no dejará crear más en esos programas
          hasta que exista al menos una.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Programa</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2 text-right">Asignaturas</th>
              <th className="px-3 py-2 text-right">Estudiantes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(p => (
              <tr key={p.program_id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{p.programa}</td>
                <td className="px-3 py-2 text-slate-500">{p.categoria ?? '—'}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${p.asignaturas === 0 ? 'text-amber-700' : ''}`}>{p.asignaturas}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${p.estudiantes > 0 ? 'font-semibold text-red-700' : 'text-slate-300'}`}>
                  {p.estudiantes > 0 ? num(p.estudiantes) : '—'}
                </td>
              </tr>
            ))}
            {!lista.length && !cargando && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                Todos los programas de nuestro campus tienen al menos una colección.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!externos.length && (
        <div className="rounded-lg border border-slate-200">
          <button onClick={() => setVerExternos(v => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-600 hover:bg-slate-50">
            {verExternos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <ExternalLink className="h-4 w-4 text-slate-400" />
            {externos.length} programas de campus externo, excluidos de esta lista a propósito
          </button>
          {verExternos && (
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="mb-2 text-xs text-slate-500">
                Se venden pero no se dictan en nuestro campus, así que no les corresponde colección.
              </p>
              <ul className="space-y-1 text-sm text-slate-600">
                {externos.map(p => (
                  <li key={p.program_id}>{p.programa}{p.categoria ? ` — ${p.categoria}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
