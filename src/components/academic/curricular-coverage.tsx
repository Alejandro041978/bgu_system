'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Fila {
  enrollment_id: string; documento: string | null; estudiante: string
  programa: string; categoria: string; situacion: string; exenta: boolean
  malla: number; faltan: number; ejemplo: string[]
}
interface Data {
  resumen: Record<string, { matriculas: number; exentas: number; asignaturas: number }>
  total: number; corregibles: number; asignaturas: number; filas: Fila[]
}

const SIT: Record<string, string> = {
  activo: 'Activo', egresado: 'Egresado', retiro_temporal: 'LOA',
  retiro_permanente: 'IW', campus_socio: 'Campus socio',
}

export function CurricularCoverage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoria, setCategoria] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function load(cat = categoria) {
    setLoading(true); setSel(new Set())
    const d = await fetch(`/api/academic/curricular-coverage?categoria=${encodeURIComponent(cat)}`).then(r => r.json())
    setData(d.error ? null : d); setLoading(false)
    if (d.error) setNotice({ kind: 'error', text: d.error })
  }
  useEffect(() => { load('') }, [])

  const corregibles = (data?.filas ?? []).filter(f => !f.exenta)
  const todo = () => setSel(sel.size === corregibles.length ? new Set() : new Set(corregibles.map(f => f.enrollment_id)))
  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s) }

  async function completar() {
    if (!sel.size) return
    if (!confirm(`Se completará el registro de ${sel.size} matrícula(s): a cada estudiante se le agregan las asignaturas de su malla que le faltan, marcadas "No iniciada".\n\nNo se les asigna nota ni periodo, y no cambia su Total Tuition.`)) return
    setBusy(true); setNotice(null)
    const d = await fetch('/api/academic/curricular-coverage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_ids: [...sel] }),
    }).then(r => r.json())
    setBusy(false)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: `${d.matriculas} matrícula(s) completadas · ${d.asignaturas} asignaturas agregadas.` })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={categoria} onChange={e => { setCategoria(e.target.value); load(e.target.value) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">Todas las categorías</option>
          {Object.keys(data?.resumen ?? {}).sort().map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {data && (
          <p className="text-sm text-gray-600">
            <strong>{data.corregibles}</strong> matrículas por completar · <strong>{data.asignaturas}</strong> asignaturas
            {data.total > data.corregibles && <span className="text-gray-400"> · {data.total - data.corregibles} con IW (no se tocan)</span>}
          </p>
        )}
        <div className="flex-1" />
        {sel.size > 0 && (
          <button onClick={completar} disabled={busy}
            className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Completar {sel.size} matrícula(s)
          </button>
        )}
      </div>

      {notice && <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>}

      {/* Resumen por categoría: dice de dónde viene el desvío sin filtrar. */}
      {data && Object.keys(data.resumen).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.resumen).sort((a, b) => b[1].matriculas - a[1].matriculas).map(([c, v]) => (
            <div key={c} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-[11px] text-gray-500">{c}</p>
              <p className="text-sm font-semibold text-gray-900">{v.matriculas - v.exentas} por completar
                {v.exentas > 0 && <span className="font-normal text-gray-400"> · {v.exentas} IW</span>}</p>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={sel.size > 0 && sel.size === corregibles.length} onChange={todo} />
                </th>
                <th className="text-left px-3 py-2.5">Estudiante</th>
                <th className="text-left px-3 py-2.5">Programa</th>
                <th className="text-left px-3 py-2.5 w-28">Situación</th>
                <th className="text-center px-3 py-2.5 w-28">Registro</th>
                <th className="text-left px-3 py-2.5">Le faltan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.filas.map(f => (
                <tr key={f.enrollment_id} className={f.exenta ? 'opacity-50' : 'hover:bg-gray-50/50'}>
                  <td className="px-4 py-2.5">
                    {!f.exenta && <input type="checkbox" checked={sel.has(f.enrollment_id)} onChange={() => toggle(f.enrollment_id)} />}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-800">{f.estudiante}</p>
                    <p className="text-xs text-gray-400">{f.documento ?? '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{f.programa}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.exenta ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
                      {SIT[f.situacion] ?? f.situacion}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-semibold text-gray-800">{f.malla - f.faltan}</span>
                    <span className="text-gray-400"> / {f.malla}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {f.faltan} · {f.ejemplo.join(', ')}{f.faltan > f.ejemplo.length ? '…' : ''}
                  </td>
                </tr>
              ))}
              {data.filas.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-12 text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  Todos los registros están completos.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-gray-400">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
        Las matrículas con IW se listan pero no se completan: su registro está incompleto por una razón.
      </p>
    </div>
  )
}
