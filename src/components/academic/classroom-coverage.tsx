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
  // Cascada categoría → programa → botón (regla del usuario, 07/09/2026):
  // no se calcula NADA hasta elegir el programa y pulsar "Ver cobertura".
  // Al montar solo se trae la lista liviana para los selectores.
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [lista, setLista] = useState<{ id: string; name: string; category_id: string | null }[]>([])
  const [cat, setCat] = useState('')
  const [sel, setSel] = useState('')
  const [cursos, setCursos] = useState<Curso[] | null>(null)
  const [resumen, setResumen] = useState<Programa | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/academic/moodle-links?vista=programas', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setCats(j.categorias ?? []); setLista(j.programas ?? []) })
      .catch(() => setError('No se pudo cargar la lista de programas'))
  }, [])

  const traer = async () => {
    if (!sel) return
    setCargando(true); setError(null); setAbierto(null)
    try {
      const r = await fetch(`/api/academic/moodle-links?vista=cobertura&programa=${encodeURIComponent(sel)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      const p = (j.programas ?? []).find((x: Programa) => x.program_id === sel) ?? null
      setResumen(p)
      setCursos(p?.cursos ?? [])
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }

  const programasDeCat = cat ? lista.filter(p => p.category_id === cat) : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={cat} onChange={e => { setCat(e.target.value); setSel(''); setCursos(null); setResumen(null) }}
          className="min-w-[16rem] rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Categoría…</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={sel} onChange={e => { setSel(e.target.value); setCursos(null); setResumen(null) }}
          disabled={!cat} className="min-w-[22rem] rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400">
          <option value="">{cat ? (programasDeCat.length ? 'Programa…' : 'Sin programas en esta categoría') : 'Elige primero la categoría'}</option>
          {programasDeCat.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={traer} disabled={cargando || !sel}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Ver cobertura
        </button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {!cursos && !cargando && !error && (
        <p className="py-8 text-center text-sm text-slate-400">Elige categoría y programa, y pulsa «Ver cobertura».</p>
      )}

      {resumen && cursos && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span><b>{num(resumen.asignaturas)}</b> asignaturas</span>
          <span>·</span><span><b>{num(resumen.aulas)}</b> aulas</span>
          <span>·</span><span><b>{num(resumen.matriculas)}</b> matrículas</span>
          <span>·</span><span className={resumen.sin_ninguna_aula ? 'font-semibold text-red-700' : ''}>{resumen.sin_ninguna_aula} sin ninguna aula</span>
          <span>·</span><span className={resumen.con_alumnos_sin_sincronizar ? 'font-semibold text-amber-700' : ''}>{resumen.con_alumnos_sin_sincronizar} con alumnos sin sincronizar</span>
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
