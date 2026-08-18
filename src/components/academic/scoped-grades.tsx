'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search, Pencil, X, ShieldCheck } from 'lucide-react'

interface Fila {
  external_id: string | null
  enrollment_id: string | null
  document_number: string | null
  student_name: string | null
  course_name: string | null
  programa: string
  semester: string | null
  final_grade: number | null
  retake_grade: number | null
  estado: string | null
  editada: boolean
}
interface Asignatura { id: string; name: string; programa: string }
interface Data {
  titulo: string
  asignaturas: Asignatura[]
  filas: Fila[]
  total: number
  sin_nota?: number
  limite?: number
  sin_alcance?: boolean
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  aprobado: { label: 'Aprobado', cls: 'bg-green-50 text-green-700' },
  reprobado: { label: 'Desaprobado', cls: 'bg-rose-50 text-rose-700' },
  pendiente: { label: 'En curso', cls: 'bg-gray-100 text-gray-500' },
}

export function ScopedGrades({ endpoint, explica }: { endpoint: string; explica: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [curso, setCurso] = useState('')
  const [editando, setEditando] = useState<Fila | null>(null)
  const [fFinal, setFFinal] = useState('')
  const [fMotivo, setFMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errEdit, setErrEdit] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback(async (busqueda: string, cursoId: string) => {
    setLoading(true); setError(null)
    const p = new URLSearchParams()
    if (busqueda.trim()) p.set('q', busqueda.trim())
    if (cursoId) p.set('course', cursoId)
    const r = await fetch(`${endpoint}?${p}`)
    const d = await r.json().catch(() => ({ error: 'Error de red' }))
    setLoading(false)
    if (!r.ok || d.error) { setError(d.error ?? 'No autorizado'); return }
    setData(d)
  }, [endpoint])

  useEffect(() => { cargar('', '') }, [cargar])

  function onBuscar(v: string) {
    setQ(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => cargar(v, curso), 350)
  }

  function abrir(f: Fila) {
    setEditando(f)
    setFFinal(f.final_grade == null ? '' : String(f.final_grade))
    setFMotivo(''); setErrEdit(null)
  }

  async function guardar() {
    if (!editando) return
    if (!fMotivo.trim()) { setErrEdit('El motivo es obligatorio.'); return }
    const n = fFinal.trim() === '' ? null : Number(fFinal.trim())
    if (n !== null && (!isFinite(n) || n < 0 || n > 100)) { setErrEdit('La nota debe ser un número entre 0 y 100.'); return }
    setGuardando(true); setErrEdit(null)
    const r = await fetch(endpoint, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editando.external_id ? { external_id: editando.external_id } : { enrollment_id: editando.enrollment_id }),
        changes: { final_grade: n }, reason: fMotivo.trim(),
      }),
    })
    const d = await r.json().catch(() => ({ error: 'Error de red' }))
    setGuardando(false)
    if (!r.ok || d.error) { setErrEdit(d.error ?? 'Error al guardar'); return }
    setEditando(null)
    cargar(q, curso)
  }

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!data) return null

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed">{explica}</p>
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Cada cambio queda registrado con tu nombre, el valor anterior y el motivo, y protege la nota
          de que una sincronización la sobrescriba.
        </p>
      </div>

      {data.sin_alcance ? (
        <p className="text-sm text-amber-800 bg-amber-50 px-4 py-3 rounded-xl">
          Todavía no hay asignaturas en este ámbito, así que no hay nada que editar.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => onBuscar(e.target.value)}
                placeholder="Buscar por estudiante o documento"
                className="flex-1 px-2 py-2 text-sm focus:outline-none bg-transparent" />
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />}
            </div>
            <select value={curso} onChange={e => { setCurso(e.target.value); cargar(q, e.target.value) }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white max-w-[380px]">
              <option value="">Todas las asignaturas ({data.asignaturas.length})</option>
              {data.asignaturas.map(a => <option key={a.id} value={a.id}>{a.name} — {a.programa}</option>)}
            </select>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline justify-between">
              <p className="text-xs text-gray-500">
                {data.total} inscripcion{data.total === 1 ? '' : 'es'} en el ámbito
                {(data.sin_nota ?? 0) > 0 && <span className="text-amber-600 font-medium"> · {data.sin_nota} sin nota</span>}
                {data.limite && data.total > data.limite ? ` · se muestran ${data.limite}, afina la búsqueda` : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Estudiante</th>
                    <th className="text-left px-3 py-2 font-medium">Asignatura</th>
                    <th className="text-left px-3 py-2 font-medium">Programa</th>
                    <th className="text-right px-3 py-2 font-medium">Nota</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.filas.map(f => {
                    const st = ESTADO[String(f.estado)] ?? { label: '—', cls: 'bg-gray-50 text-gray-400' }
                    const nota = f.retake_grade ?? f.final_grade
                    return (
                      <tr key={f.external_id ?? f.enrollment_id ?? Math.random()} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2.5">
                          <p className="text-gray-800">{f.student_name ?? '—'}</p>
                          <p className="text-[11px] text-gray-400">{f.document_number ?? '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">
                          {f.course_name ?? '—'}
                          {f.semester && <span className="block text-[11px] text-gray-400">{f.semester}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{f.programa}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                          {nota == null ? <span className="text-gray-300">sin nota</span> : nota}
                          {f.editada && <span className="block text-[10px] text-blue-500">editada a mano</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => abrir(f)} title="Registrar o corregir la nota"
                            className="p-1 text-gray-300 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {!data.filas.length && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">Sin resultados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => !guardando && setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Nota de {editando.student_name}</p>
              <button onClick={() => setEditando(null)} disabled={guardando}
                className="p-1 rounded text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">{editando.course_name} · {editando.programa}</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nota final (0-100, vacío la borra)</label>
                <input value={fFinal} onChange={e => setFFinal(e.target.value)} inputMode="decimal"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motivo (obligatorio)</label>
                <input value={fMotivo} onChange={e => setFMotivo(e.target.value)}
                  placeholder="De dónde sale esta nota"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[11px] text-gray-400 mt-1">
                  Queda escrito junto al cambio. Dentro de un año será lo único que explique por qué esta
                  nota dice lo que dice.
                </p>
              </div>
              {errEdit && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errEdit}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setEditando(null)} disabled={guardando}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
