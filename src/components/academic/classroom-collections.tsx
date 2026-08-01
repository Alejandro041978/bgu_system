'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Plus, Power, PowerOff, ArrowLeft, CircleSlash } from 'lucide-react'

interface Coleccion {
  id: string; program_id: string; programa: string; name: string
  language: string | null; partner: string | null; suffix: string | null; active: boolean
  asignaturas: number; con_aula: number; sincronizando: number
  alumnos: number; alumnos_activos: number; matriculas_en_aulas: number
}
interface Candidata { aula_id: number; shortname: string | null; matriculados: number; coincide_sufijo: boolean }
interface Casilla {
  course_id: string; code: string | null; name: string | null
  aula: { aula_id: number; shortname: string | null; matriculados: number; sync_enabled: boolean } | null
  candidatas: Candidata[]
}

const num = (n: number) => n.toLocaleString('es-PE')

export function ClassroomCollections() {
  const [cols, setCols] = useState<Coleccion[]>([])
  const [sel, setSel] = useState<Coleccion | null>(null)
  const [casillas, setCasillas] = useState<Casilla[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [programas, setProgramas] = useState<{ id: string; name: string }[]>([])
  const [nueva, setNueva] = useState({ program_id: '', name: '', language: '', partner: '', suffix: '' })

  const listar = async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/academic/moodle-collections', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setCols(j.colecciones ?? [])
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  const abrir = async (c: Coleccion) => {
    setSel(c); setCasillas(null); setCargando(true)
    try {
      const r = await fetch(`/api/academic/moodle-collections?id=${c.id}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setCasillas(j.casillas ?? [])
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => {
    listar()
    fetch('/api/academic/programs').then(r => r.json())
      .then(j => setProgramas(Array.isArray(j) ? j : (j.programs ?? j.programas ?? [])))
      .catch(() => { /* el selector se queda vacío; no rompe la pantalla */ })
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accion = async (body: any, etiqueta: string) => {
    setAviso(null); setError(null)
    try {
      const r = await fetch('/api/academic/moodle-collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falló la operación')
      setAviso(j.reemplazo ? `${etiqueta} — el aula ${j.reemplazo} salió de la casilla y sigue sincronizando hasta que sus alumnos terminen` : etiqueta)
      if (sel) await abrir(sel)
      await listar()
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }

  if (sel && casillas) {
    const llenas = casillas.filter(c => c.aula).length
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => { setSel(null); setCasillas(null) }}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Colecciones
          </button>
          <div>
            <p className="font-medium text-slate-900">{sel.name}</p>
            <p className="text-xs text-slate-500">{sel.programa}</p>
          </div>
          <span className={`rounded px-2 py-1 text-sm ${llenas === casillas.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {llenas} de {casillas.length} asignaturas con aula
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => accion({ accion: 'sincronizar', collection_id: sel.id }, 'Colección sincronizando')}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Power className="h-4 w-4" /> Sincronizar toda
            </button>
            <button onClick={() => accion({ accion: 'apagar', collection_id: sel.id }, 'Colección apagada')}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600">
              <PowerOff className="h-4 w-4" /> Apagar toda
            </button>
          </div>
        </div>

        {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {aviso && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Asignatura</th>
                <th className="px-3 py-2">Aula</th>
                <th className="px-3 py-2 text-right">Alumnos</th>
                <th className="px-3 py-2">Sincronía</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {casillas.map(c => (
                <tr key={c.course_id} className={`border-t border-slate-100 ${c.aula ? '' : 'bg-amber-50/40'}`}>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-slate-500">{c.code}</span>
                    <span className="ml-2 text-slate-800">{c.name}</span>
                  </td>
                  <td className="px-3 py-2">
                    {c.aula ? (
                      <span className="text-slate-700">
                        <span className="font-mono text-xs text-slate-500">{c.aula.aula_id}</span> · {c.aula.shortname}
                      </span>
                    ) : c.candidatas.length ? (
                      <select defaultValue="" onChange={e => e.target.value && accion(
                        { accion: 'asignar', collection_id: sel.id, course_id: c.course_id, aula_id: e.target.value },
                        `Aula ${e.target.value} asignada a ${c.code}`)}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm">
                        <option value="">Elegir aula…</option>
                        {c.candidatas.map(a => (
                          <option key={a.aula_id} value={a.aula_id}>
                            {a.aula_id} · {a.shortname} ({a.matriculados} al.){a.coincide_sufijo ? ' ✓' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <CircleSlash className="h-3 w-3" /> no hay aula libre con este código — hay que crearla en Moodle
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.aula ? num(c.aula.matriculados) : '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.aula
                      ? (c.aula.sync_enabled
                        ? <span className="text-emerald-700">sincronizando</span>
                        : <span className="text-slate-400">apagada</span>)
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.aula && (
                      <button onClick={() => accion({ accion: 'vaciar', collection_id: sel.id, course_id: c.course_id }, `${c.code} liberada`)}
                        className="text-xs text-slate-400 hover:text-red-600">quitar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={listar} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
        </button>
        <button onClick={() => setCreando(v => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> Nueva colección
        </button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {aviso && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      {creando && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 lg:grid-cols-6">
          <select value={nueva.program_id} onChange={e => setNueva({ ...nueva, program_id: e.target.value })}
            className="rounded border border-slate-300 px-2 py-2 text-sm lg:col-span-2">
            <option value="">Programa…</option>
            {programas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="Nombre (BSBA · Inglés)" value={nueva.name} onChange={e => setNueva({ ...nueva, name: e.target.value })}
            className="rounded border border-slate-300 px-2 py-2 text-sm lg:col-span-2" />
          <input placeholder="Idioma (es/en)" value={nueva.language} onChange={e => setNueva({ ...nueva, language: e.target.value })}
            className="rounded border border-slate-300 px-2 py-2 text-sm" />
          <input placeholder="Sufijo en Moodle" value={nueva.suffix} onChange={e => setNueva({ ...nueva, suffix: e.target.value })}
            className="rounded border border-slate-300 px-2 py-2 text-sm" />
          <button onClick={() => accion({ accion: 'crear', ...nueva }, 'Colección creada').then(() => { setCreando(false); setNueva({ program_id: '', name: '', language: '', partner: '', suffix: '' }) })}
            disabled={!nueva.program_id || !nueva.name}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40 lg:col-span-6">
            Crear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Colección</th>
              <th className="px-3 py-2">Programa</th>
              <th className="px-3 py-2 text-right">Cobertura</th>
              <th className="px-3 py-2 text-right">Sincronizando</th>
              <th className="px-3 py-2 text-right">Alumnos</th>
              <th className="px-3 py-2 text-right">Matrículas en aulas</th>
            </tr>
          </thead>
          <tbody>
            {cols.map(c => (
              <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => abrir(c)}>
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">{c.name}</span>
                  {c.language && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{c.language}</span>}
                  {c.suffix && <span className="ml-1 font-mono text-xs text-slate-400">{c.suffix}</span>}
                </td>
                <td className="px-3 py-2 text-slate-600">{c.programa}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${c.con_aula === c.asignaturas ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {c.con_aula} / {c.asignaturas}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.sincronizando}</td>
                <td className="px-3 py-2 text-right tabular-nums" title="Estudiantes con esta colección elegida en su matrícula">
                  {num(c.alumnos)}
                  {c.alumnos_activos !== c.alumnos && <span className="ml-1 text-xs text-slate-400">({num(c.alumnos_activos)} activos)</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500" title="Suma de matriculados de sus aulas: cada alumno cuenta una vez por asignatura">
                  {num(c.matriculas_en_aulas)}
                </td>
              </tr>
            ))}
            {!cols.length && !cargando && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">
                Todavía no hay colecciones. Crea la primera con el botón de arriba.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
