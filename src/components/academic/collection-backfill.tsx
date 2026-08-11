'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, PlayCircle, AlertTriangle, CheckCircle2, Search } from 'lucide-react'

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

interface Ruta { group_id: string; label: string; matriculas: number }
interface Celda { collection_id: string | null; coleccion: string; matriculas: number; sin_carrusel: number; carruseles: Ruta[] }
interface BloquePrograma {
  program_id: string; programa: string; externo: boolean
  total: number; sin_coleccion: number; sin_carrusel: number
  carruseles_del_programa: number; colecciones: Celda[]
}
interface Resumen { total: number; con: number; sin: number; sin_carrusel: number; programas: number }
interface Catalogo { categorias: { id: string; name: string }[]; programas: { id: string; name: string; category_id: string }[] }

// Resumen de matrículas por colección, con filtro. El total de 1.081 dice que
// hay un problema pero no por dónde empezar; esto lo parte por categoría y
// programa para poder ir cerrándolo a pedazos.
function ResumenMatriculas() {
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [programId, setProgramId] = useState('')
  const [filas, setFilas] = useState<BloquePrograma[] | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/academic/collection-summary').then(r => r.json())
      .then(d => setCat(d.catalogo ?? null)).catch(() => { /* el botón avisa */ })
  }, [])

  async function consultar() {
    if (!categoryId) return
    setCargando(true); setError(null)
    const q = new URLSearchParams({ category_id: categoryId })
    if (programId) q.set('program_id', programId)
    const d = await fetch(`/api/academic/collection-summary?${q}`).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setCargando(false)
    if (d.error) { setError(d.error); setFilas(null); setResumen(null); return }
    setFilas(d.programas ?? []); setResumen(d.resumen ?? null)
  }

  const programas = (cat?.programas ?? []).filter(p => p.category_id === categoryId)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Resumen de matrículas por colección</h3>
        <p className="text-xs text-gray-500 mt-0.5">Matrículas de estudiantes activos. Elige categoría y, si quieres, un programa.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setProgramId('') }} className={inp}>
            <option value="">Seleccionar…</option>
            {(cat?.categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[240px]">
          <span className="block text-xs text-gray-500 mb-1">Programa</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp} disabled={!categoryId}>
            <option value="">{categoryId ? 'Todos los de la categoría' : 'Elige la categoría'}</option>
            {programas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button onClick={consultar} disabled={!categoryId || cargando}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Consultar
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Dato label="Matrículas" valor={resumen.total} />
          <Dato label="Programas" valor={resumen.programas} />
          <Dato label="Con colección" valor={resumen.con} tono="ok" />
          <Dato label="Sin colección" valor={resumen.sin} tono={resumen.sin ? 'alerta' : 'ok'} />
          <Dato label="Sin carrusel" valor={resumen.sin_carrusel} tono={resumen.sin_carrusel ? 'alerta' : 'ok'} />
        </div>
      )}

      {filas && filas.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">No hay matrículas de estudiantes activos en ese ámbito.</p>
      )}

      {filas && filas.length > 0 && (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2">Programa · Colección</th>
                <th className="text-right px-4 py-2 w-24">Matrículas</th>
                <th className="text-left px-4 py-2">Carruseles (rutas)</th>
                <th className="text-right px-4 py-2 w-28">Sin carrusel</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(p => {
                // El total del programa manda: la suma de sus colecciones tiene
                // que dar ese número, y si no da, el descuadre se ve aquí.
                const suma = p.colecciones.reduce((s, c) => s + c.matriculas, 0)
                return [
                  <tr key={p.program_id} className="border-t border-gray-200 bg-gray-50/70">
                    <td className="px-4 py-2 font-semibold text-gray-800">
                      {p.programa}
                      <span className="ml-2 text-[11px] font-normal text-gray-400">
                        {p.carruseles_del_programa} carrusel{p.carruseles_del_programa === 1 ? '' : 'es'}
                        {p.externo ? ' · campus externo' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">
                      {p.total}
                      {suma !== p.total && <span className="block text-[11px] font-normal text-red-600">suma {suma}</span>}
                    </td>
                    <td className="px-4 py-2"></td>
                    <td className={`px-4 py-2 text-right font-semibold ${p.sin_carrusel ? 'text-amber-700' : 'text-gray-300'}`}>
                      {p.sin_carrusel || '—'}
                    </td>
                  </tr>,
                  ...p.colecciones.map(c => {
                    const sinCol = c.collection_id === null
                    return (
                      <tr key={`${p.program_id}|${c.collection_id ?? '—'}`} className={`border-t border-gray-50 ${sinCol ? 'bg-amber-50/60' : ''}`}>
                        <td className={`px-4 py-2 pl-8 ${sinCol ? 'text-amber-800 font-medium' : 'text-gray-600'}`}>{c.coleccion}</td>
                        <td className={`px-4 py-2 text-right ${sinCol ? 'text-amber-800 font-semibold' : 'text-gray-800'}`}>{c.matriculas}</td>
                        <td className="px-4 py-2">
                          {c.carruseles.length === 0
                            ? <span className="text-xs text-gray-300">—</span>
                            : (
                              <span className="flex flex-wrap gap-1">
                                {c.carruseles.map(r => (
                                  <span key={r.group_id} className="text-[11px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                                    {r.label} <b>{r.matriculas}</b>
                                  </span>
                                ))}
                              </span>
                            )}
                        </td>
                        <td className={`px-4 py-2 text-right ${c.sin_carrusel ? 'text-amber-700 font-medium' : 'text-gray-300'}`}>
                          {c.sin_carrusel || '—'}
                        </td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {filas && filas.length > 0 && (
        <p className="text-[11px] text-gray-400">
          La colección es el aula; el carrusel es la ruta —qué cursa y en qué orden—. Un estudiante puede tener
          colección y no tener ruta, o al revés: son dos vínculos distintos y aquí se ven cruzados.
        </p>
      )}
    </div>
  )
}

function Dato({ label, valor, tono }: { label: string; valor: number; tono?: 'ok' | 'alerta' }) {
  const cls = tono === 'alerta' ? 'text-amber-700' : tono === 'ok' ? 'text-green-700' : 'text-gray-800'
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2">
      <span className="block text-[11px] text-gray-500">{label}</span>
      <span className={`text-lg font-semibold ${cls}`}>{valor}</span>
    </div>
  )
}

const inp = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

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

  // El resumen se muestra siempre: sirve para mirar el reparto aunque ya no
  // quede nada por completar.
  return (
    <div className="space-y-5">
      <ResumenMatriculas />
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
      ) : !data ? null : data.total === 0 ? (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Todas las matrículas de estudiantes activos tienen su colección de aulas.
        </p>
      ) : (
        <Pendientes {...{ data, notice, busy, eleccion, setEleccion, aplicarTodo, resolver, aEscribir }} />
      )}
    </div>
  )
}

interface PendientesProps {
  data: Data
  notice: { kind: 'ok' | 'error'; text: string } | null
  busy: string | null
  eleccion: Record<string, string>
  setEleccion: React.Dispatch<React.SetStateAction<Record<string, string>>>
  aplicarTodo: () => void
  resolver: (b: Bloque) => void
  aEscribir: number
}

function Pendientes({ data, notice, busy, eleccion, setEleccion, aplicarTodo, resolver, aEscribir }: PendientesProps) {
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
