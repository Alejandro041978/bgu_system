'use client'

import { Fragment, useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, Power, PowerOff } from 'lucide-react'

interface AulaDet {
  aula_id: number; shortname: string | null; modalidad: string
  matriculados: number; sync_enabled: boolean; estado: string
}
interface Curso {
  course_id: string; code: string | null; name: string | null
  aulas: number; matriculas: number; sincronizando: number
  alerta: string | null; detalle: AulaDet[]
}
interface Programa {
  program_id: string; programa: string
  asignaturas: number; aulas: number; matriculas: number
  sin_ninguna_aula: number; con_alumnos_sin_sincronizar: number
  cursos?: Curso[]
}

const num = (n: number) => n.toLocaleString('es-PE')

export function ClassroomCoverage() {
  const [progs, setProgs] = useState<Programa[]>([])
  const [sel, setSel] = useState<string>('')
  const [cursos, setCursos] = useState<Curso[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const traer = async (programa?: string) => {
    setCargando(true); setError(null)
    try {
      const q = programa ? `&programa=${encodeURIComponent(programa)}` : ''
      const r = await fetch(`/api/academic/moodle-links?vista=cobertura${q}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setProgs(j.programas ?? [])
      if (programa) setCursos((j.programas ?? []).find((p: Programa) => p.program_id === programa)?.cursos ?? [])
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  const elegir = (pid: string) => { setSel(pid); setCursos(null); setAbierto(null); if (pid) traer(pid) }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={sel} onChange={e => elegir(e.target.value)}
          className="min-w-[22rem] rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Elige un programa…</option>
          {progs.map(p => (
            <option key={p.program_id} value={p.program_id}>
              {p.programa} — {p.asignaturas} asignaturas · {p.aulas} aulas
            </option>
          ))}
        </select>
        <button onClick={() => traer(sel || undefined)} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
        </button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {!sel && !!progs.length && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Programa</th>
                <th className="px-3 py-2 text-right">Asignaturas</th>
                <th className="px-3 py-2 text-right">Aulas</th>
                <th className="px-3 py-2 text-right">Matrículas</th>
                <th className="px-3 py-2 text-right">Sin ninguna aula</th>
                <th className="px-3 py-2 text-right">Con alumnos sin sincronizar</th>
              </tr>
            </thead>
            <tbody>
              {progs.map(p => (
                <tr key={p.program_id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => elegir(p.program_id)}>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.programa}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(p.asignaturas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(p.aulas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(p.matriculas)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${p.sin_ninguna_aula ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{p.sin_ninguna_aula}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${p.con_alumnos_sin_sincronizar ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{p.con_alumnos_sin_sincronizar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && cursos && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Asignatura</th>
                <th className="px-3 py-2 text-right">Aulas</th>
                <th className="px-3 py-2 text-right">Matrículas</th>
                <th className="px-3 py-2 text-right">Sincronizando</th>
                <th className="px-3 py-2">Situación</th>
              </tr>
            </thead>
            <tbody>
              {cursos.map(c => (
                <Fragment key={c.course_id}>
                  <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setAbierto(abierto === c.course_id ? null : c.course_id)}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.code}</td>
                    <td className="px-3 py-2 text-slate-800">{c.name}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${c.aulas === 0 ? 'font-semibold text-red-700' : ''}`}>{c.aulas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(c.matriculas)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${c.sincronizando ? 'text-emerald-700' : 'text-slate-400'}`}>{c.sincronizando}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.alerta
                        ? <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-amber-800"><AlertTriangle className="h-3 w-3" />{c.alerta}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                  {abierto === c.course_id && c.detalle.map(a => (
                    <tr key={`${c.course_id}-${a.aula_id}`} className="bg-slate-50/60 text-xs">
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 text-slate-600" colSpan={2}>
                        <span className="font-mono">{a.aula_id}</span> · {a.shortname}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">{num(a.matriculados)}</td>
                      <td className="px-3 py-1 text-right">
                        {a.sync_enabled
                          ? <span className="inline-flex items-center gap-1 text-emerald-700"><Power className="h-3 w-3" />sí</span>
                          : <span className="inline-flex items-center gap-1 text-slate-400"><PowerOff className="h-3 w-3" />no</span>}
                      </td>
                      <td className="px-3 py-1 text-slate-500">{a.modalidad} · {a.estado.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
