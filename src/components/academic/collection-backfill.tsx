'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, PlayCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Criterio { criterio: string; etiqueta: string; matriculas: number }
interface Propuesta {
  enrollment_id: string; estudiante: string; documento: string | null
  programa: string; convocatoria: string; criterio: string
  coleccion: string | null; detalle: string
}
interface Bloque {
  program_id: string; programa: string
  convocatoria_id: string | null; convocatoria: string
  matriculas: number; opciones: { id: string; name: string }[]; estudiantes: string[]
}
interface Data { total: number; por_criterio: Criterio[]; bloques: Bloque[]; muestra: Propuesta[] }

export function CollectionBackfill() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [eleccion, setEleccion] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const d = await fetch('/api/academic/collection-backfill').then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setLoading(false)
    if (d.error) { setError(d.error); return }
    setData(d)
  }, [])
  useEffect(() => { load() }, [load])

  const conCriterio = (data?.por_criterio ?? []).filter(c => c.criterio !== 'pendiente' && c.criterio !== 'externo')
  const aEscribir = conCriterio.reduce((s, c) => s + c.matriculas, 0)

  async function aplicarTodo() {
    if (!confirm(
      `Se va a escribir la colección de aulas en ${aEscribir} matrículas, según el criterio de cada una.\n\n` +
      `No se toca ninguna de las pendientes: quedarán abajo para decidirlas por bloque.\n\n` +
      `La colección decide a qué aula entra cada estudiante, así que revisa el resumen antes de continuar.`)) return
    setBusy('auto'); setNotice(null)
    const d = await fetch('/api/academic/collection-backfill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'auto' }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: `${d.escritas} matrículas con colección asignada.` })
    load()
  }

  async function resolver(b: Bloque) {
    const k = `${b.program_id}|${b.convocatoria_id ?? '—'}`
    const collectionId = eleccion[k]
    if (!collectionId) return
    const nombre = b.opciones.find(o => o.id === collectionId)?.name ?? ''
    if (!confirm(`Se asignará la colección "${nombre}" a las ${b.matriculas} matrículas de ${b.programa} — ${b.convocatoria}.`)) return
    setBusy(k); setNotice(null)
    const d = await fetch('/api/academic/collection-backfill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'bloque', program_id: b.program_id, convocatoria_id: b.convocatoria_id, collection_id: collectionId }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: `${d.escritas} matrículas asignadas a "${nombre}".` })
    load()
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!data) return null

  if (data.total === 0) {
    return (
      <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" /> Todas las matrículas de estudiantes activos tienen su colección de aulas.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p className={`text-sm px-4 py-3 rounded-xl ${notice.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          <strong className="text-gray-800">{data.total}</strong> matrículas de estudiantes activos no tienen colección de aulas.
          Sin ella, el aprovisionamiento de Moodle usa el aula pegada a la oferta, que es la misma para todos: quien estudia
          en el campus socio o en inglés termina en el aula de la colección regular.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Cada propuesta lleva el criterio que la sostiene. Lo que no se puede sostener con evidencia queda abajo, sin asignar:
          no tener colección se ve en este reporte, tener la equivocada no se ve hasta que un estudiante entra a un aula ajena.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {data.por_criterio.map(c => (
              <tr key={c.criterio} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2.5 text-gray-700">{c.etiqueta}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-800 w-24">{c.matriculas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aEscribir > 0 && (
        <button onClick={aplicarTodo} disabled={busy === 'auto'}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
          {busy === 'auto' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Aplicar las {aEscribir} con criterio
        </button>
      )}

      {data.bloques.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Necesitan decisión: {data.bloques.reduce((s, b) => s + b.matriculas, 0)} matrículas</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Agrupadas por programa y convocatoria, que es como se decidió en su día. Al elegir una colección se aplica a todo el bloque.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-4 py-2">Programa · Convocatoria</th>
                  <th className="text-right px-4 py-2">Matrículas</th>
                  <th className="text-left px-4 py-2">Colección</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.bloques.map(b => {
                  const k = `${b.program_id}|${b.convocatoria_id ?? '—'}`
                  return (
                    <tr key={k} className="border-t border-gray-50 align-top">
                      <td className="px-4 py-2.5">
                        <span className="text-gray-800">{b.programa}</span>
                        <span className="block text-xs text-gray-500">{b.convocatoria}</span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">
                          {b.estudiantes.slice(0, 4).join(' · ')}{b.matriculas > 4 ? ` · y ${b.matriculas - 4} más` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-700">{b.matriculas}</td>
                      <td className="px-4 py-2.5">
                        <select value={eleccion[k] ?? ''} onChange={e => setEleccion(p => ({ ...p, [k]: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm w-full min-w-[190px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={!b.opciones.length}>
                          <option value="">{b.opciones.length ? 'Elegir…' : 'El programa no tiene colecciones'}</option>
                          {b.opciones.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => resolver(b)} disabled={!eleccion[k] || busy === k}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-30">
                          {busy === k ? <Loader2 className="w-3.5 h-3.5 inline animate-spin" /> : 'Asignar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.muestra.length > 0 && (
        <details className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <summary className="px-4 py-3 text-sm text-gray-600 cursor-pointer">Ver una muestra de las propuestas con criterio</summary>
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                  <th className="text-left px-4 py-2">Estudiante</th>
                  <th className="text-left px-4 py-2">Programa</th>
                  <th className="text-left px-4 py-2">Colección propuesta</th>
                  <th className="text-left px-4 py-2">Por qué</th>
                </tr>
              </thead>
              <tbody>
                {data.muestra.map(p => (
                  <tr key={p.enrollment_id} className="border-t border-gray-50">
                    <td className="px-4 py-2 text-gray-800">{p.estudiante}<span className="block text-[11px] text-gray-400">{p.documento}</span></td>
                    <td className="px-4 py-2 text-gray-600">{p.programa}</td>
                    <td className="px-4 py-2 text-gray-800">{p.coleccion ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{p.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
