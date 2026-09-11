'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Resultados de la Encuesta a Empleadores en tiempo real, por año académico.
// Una encuesta = un empleador (puede cubrir varios titulados); los cortes se
// cuentan por titulado cubierto. Las abiertas se listan con su empresa.
interface ResLikert { id: string; tipo: 'likert'; texto: string; n: number; promedio: number | null; distribucion: number[] }
interface ResChoice { id: string; tipo: 'choice'; texto: string; n: number; opciones: { id: string; texto: string; n: number }[] }
interface ResParrafo { id: string; tipo: 'parrafo'; texto: string; n: number; respuestas: { texto: string; empresa: string }[] }
interface Data {
  anio: { id: string; name: string }
  anios: { id: string; name: string }[]
  completadas: number; invitados: number; titulados_cubiertos: number; tasa_respuesta: number
  por_categoria: { k: string; n: number }[]
  por_programa: { k: string; n: number }[]
  por_sexo: { k: string; n: number }[]
  por_pais: { k: string; n: number }[]
  resultados: (ResLikert | ResChoice | ResParrafo)[]
}

export function EmployerSurveyResults() {
  const [d, setD] = useState<Data | null>(null)
  const [anioId, setAnioId] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = async (id?: string) => {
    setCargando(true); setError(null)
    const r = await fetch(`/api/campaigns/employer-survey-results${id ? `?academic_year_id=${id}` : ''}`)
    const j = await r.json().catch(() => ({}))
    setCargando(false)
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
    setD(j); setAnioId(j.anio?.id ?? '')
  }
  useEffect(() => { traer() }, [])

  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
  if (!d) return <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div>

  const Chip = ({ items, titulo }: { items: { k: string; n: number }[]; titulo: string }) => (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{titulo}</p>
      {items.length === 0 ? <p className="text-xs text-gray-300">—</p> : (
        <div className="space-y-1">
          {items.slice(0, 6).map(x => (
            <p key={x.k} className="text-xs text-gray-600 flex justify-between gap-2">
              <span className="truncate">{x.k}</span><span className="tabular-nums font-medium">{x.n}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={anioId} onChange={e => traer(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white">
          {d.anios.map(y => <option key={y.id} value={y.id}>Año académico {y.name}</option>)}
        </select>
        {cargando && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        <span className="text-xs text-gray-400">
          Una encuesta = un empleador; si comparte varios titulados, su respuesta cubre a todos.
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-gray-900">{d.completadas}</p>
          <p className="text-[11px] text-gray-400">empleadores que respondieron</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-gray-900">{d.invitados}</p>
          <p className="text-[11px] text-gray-400">empleadores invitados en el año</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-gray-900">{d.titulados_cubiertos}</p>
          <p className="text-[11px] text-gray-400">titulados cubiertos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-blue-700">{d.tasa_respuesta}%</p>
          <p className="text-[11px] text-gray-400">tasa de respuesta</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Chip titulo="Por categoría" items={d.por_categoria} />
        <Chip titulo="Por programa" items={d.por_programa} />
        <Chip titulo="Por sexo" items={d.por_sexo ?? []} />
        <Chip titulo="Por país" items={d.por_pais} />
      </div>

      <div className="space-y-2">
        {d.resultados.map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[13px] text-gray-700">{r.texto}</p>
            {r.tipo === 'likert' && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xl font-bold tabular-nums text-gray-900 w-14">{(r as ResLikert).promedio ?? '—'}</span>
                <div className="flex-1 flex gap-1 items-end h-8">
                  {(r as ResLikert).distribucion.map((n, i) => {
                    const max = Math.max(1, ...(r as ResLikert).distribucion)
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full bg-blue-200 rounded-t" style={{ height: `${Math.round((n / max) * 24) + 2}px` }} title={`${i + 1}: ${n}`} />
                        <span className="text-[9px] text-gray-300">{i + 1}</span>
                      </div>
                    )
                  })}
                </div>
                <span className="text-[11px] text-gray-400 tabular-nums">n={r.n}</span>
              </div>
            )}
            {r.tipo === 'choice' && (
              <div className="mt-2 space-y-1">
                {(r as ResChoice).opciones.map(o => {
                  const max = Math.max(1, ...(r as ResChoice).opciones.map(x => x.n))
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-xs">
                      <span className="w-1/2 truncate text-gray-600">{o.texto}</span>
                      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                        <div className="bg-blue-400 h-3" style={{ width: `${Math.round((o.n / max) * 100)}%` }} />
                      </div>
                      <span className="tabular-nums text-gray-500 w-8 text-right">{o.n}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {r.tipo === 'parrafo' && (
              (r as ResParrafo).respuestas.length === 0
                ? <p className="text-xs text-gray-300 mt-2">Sin respuestas todavía.</p>
                : (
                  <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {(r as ResParrafo).respuestas.map((x, i) => (
                      <div key={i} className="text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-gray-700">{x.texto}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{x.empresa}</p>
                      </div>
                    ))}
                  </div>
                )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
