'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, X, Layers } from 'lucide-react'

// ---------------------------------------------------------------------------
// Electivas de un programa — fase 1: configuración (08/09/2026).
//
// Tres piezas: las CASILLAS de la malla (se marcan con el checkbox "Electiva"
// en la lista de asignaturas de arriba), el CATÁLOGO de opciones (asignaturas
// del programa fuera de la malla exigible) y los POOLS que las agrupan:
// 'menu' (se eligen sueltas) o 'especialidad' (se elige el pool completo).
// La elección por estudiante es la fase 2 (la opera Registros).
// ---------------------------------------------------------------------------
interface CursoLite { id: string; code: string | null; name: string; credits: number | null }
interface Pool { id: string; name: string; tipo: 'menu' | 'especialidad'; nota: string | null; course_ids: string[] }
interface Data { casillas: CursoLite[]; opciones: CursoLite[]; pools: Pool[] }

export function ElectivesManager({ programId }: { programId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nuevoPool, setNuevoPool] = useState({ name: '', tipo: 'menu' as 'menu' | 'especialidad' })
  const [nuevaOpcion, setNuevaOpcion] = useState({ code: '', name: '' })
  const [agregandoA, setAgregandoA] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(`/api/academic/electives?program_id=${programId}`).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    if (d.error) { setError(d.error); return }
    setData(d); setError(null)
  }, [programId])
  useEffect(() => { load() }, [load])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function accion(body: Record<string, any>) {
    setBusy(true); setError(null)
    const d = await fetch('/api/academic/electives', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(false)
    if (d.error) { setError(d.error); return false }
    load()
    return true
  }

  if (error && !data) return <p className="text-xs text-red-600">{error}</p>
  if (!data) return <p className="text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />Cargando electivas…</p>

  const nombreDe = new Map([...data.opciones, ...data.casillas].map(c => [c.id, `${c.code ?? ''} ${c.name}`.trim()]))
  // Una opción vive en UN solo pool: el selector solo ofrece las que aún no
  // están en ninguno (corrección del usuario, 08/09).
  const enAlgunPool = new Set(data.pools.flatMap(p => p.course_ids))

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      <div className="text-xs text-gray-500">
        <b className="text-gray-700">{data.casillas.length}</b> casilla(s) electiva(s) en la malla
        {data.casillas.length > 0 && <span className="text-gray-400"> — {data.casillas.map(c => c.code ?? c.name).join(', ')}</span>}
        {data.casillas.length === 0 && <span className="text-amber-700"> · marca asignaturas de la malla con el checkbox «Electiva» para crearlas</span>}
      </div>

      {/* Pools */}
      <div className="space-y-2">
        {data.pools.map(p => (
          <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-sm font-medium text-gray-800">{p.name}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${p.tipo === 'especialidad' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
                {p.tipo === 'especialidad' ? 'Especialidad (se elige completo)' : 'Menú (se eligen sueltas)'}
              </span>
              <span className="text-[11px] text-gray-400">{p.course_ids.length} opción(es)</span>
              <button onClick={() => confirm(`¿Eliminar el pool "${p.name}"?`) && accion({ accion: 'pool_eliminar', pool_id: p.id })}
                disabled={busy} className="ml-auto p-1 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.course_ids.map(cid => (
                <span key={cid} className="inline-flex items-center gap-1 text-[11px] bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 text-gray-600">
                  {nombreDe.get(cid) ?? cid}
                  <button onClick={() => accion({ accion: 'pool_quitar_curso', pool_id: p.id, course_id: cid })}
                    disabled={busy} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {agregandoA === p.id ? (
                <select autoFocus disabled={busy} defaultValue=""
                  onChange={async e => { if (e.target.value) { await accion({ accion: 'pool_agregar_curso', pool_id: p.id, course_id: e.target.value }) } setAgregandoA(null) }}
                  onBlur={() => setAgregandoA(null)}
                  className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5">
                  <option value="">Agregar opción…</option>
                  {data.opciones.filter(o => !enAlgunPool.has(o.id)).map(o => (
                    <option key={o.id} value={o.id}>{o.code ?? '—'} · {o.name}</option>
                  ))}
                </select>
              ) : (
                <button onClick={() => setAgregandoA(p.id)} disabled={busy}
                  className="text-[11px] text-blue-600 hover:underline">+ agregar opción</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Crear pool */}
      <div className="flex items-center gap-2">
        <input value={nuevoPool.name} onChange={e => setNuevoPool(v => ({ ...v, name: e.target.value }))}
          placeholder="Nuevo pool (ej. Especialidad en Marketing)"
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs flex-1 max-w-xs" />
        <select value={nuevoPool.tipo} onChange={e => setNuevoPool(v => ({ ...v, tipo: e.target.value as 'menu' | 'especialidad' }))}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="menu">Menú</option>
          <option value="especialidad">Especialidad</option>
        </select>
        <button disabled={busy || !nuevoPool.name.trim()}
          onClick={async () => { if (await accion({ accion: 'pool_crear', program_id: programId, ...nuevoPool })) setNuevoPool({ name: '', tipo: 'menu' }) }}
          className="inline-flex items-center gap-1 text-xs border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
          <Plus className="w-3 h-3" /> Crear pool
        </button>
      </div>

      {/* Crear opción del catálogo — SIN créditos: la casilla los manda */}
      <div className="flex items-center gap-2">
        <input value={nuevaOpcion.code} onChange={e => setNuevaOpcion(v => ({ ...v, code: e.target.value }))}
          placeholder="Código" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-24" />
        <input value={nuevaOpcion.name} onChange={e => setNuevaOpcion(v => ({ ...v, name: e.target.value }))}
          placeholder="Nueva opción del catálogo (ej. Taller de Fotografía)"
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs flex-1 max-w-sm" />
        <button disabled={busy || !nuevaOpcion.name.trim()}
          onClick={async () => {
            if (await accion({ accion: 'opcion_crear', program_id: programId, code: nuevaOpcion.code, name: nuevaOpcion.name })) {
              setNuevaOpcion({ code: '', name: '' })
            }
          }}
          className="inline-flex items-center gap-1 text-xs border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
          <Plus className="w-3 h-3" /> Crear opción
        </button>
      </div>

      <p className="text-[11px] text-gray-400">
        Las opciones son asignaturas del programa fuera de la malla exigible (nacen así al crearlas aquí, y sin créditos
        propios: la casilla manda los créditos). Cada opción pertenece a un solo pool. La elección por estudiante
        (fase 2) la operará Registros.
      </p>
    </div>
  )
}
