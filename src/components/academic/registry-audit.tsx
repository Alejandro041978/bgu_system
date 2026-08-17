'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react'

interface Hallazgo {
  clave: string; titulo: string; explica: string; siSube: string
  n: number; esperado: number; ejemplos: string[]
}
interface Data { hallazgos: Hallazgo[]; totales: Record<string, number> }

export function RegistryAudit() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/academic/registry-audit')
      const d = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}` }))
      if (!r.ok || d.error) { setError(d.error ?? 'Error'); return }
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!data) return null

  const peor = data.hallazgos.filter(h => h.n > h.esperado)

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            <p>
              El registro por asignatura es desde el 15 de agosto la fuente de <strong>qué tiene inscrito</strong> un
              estudiante, y de ahí sale su precio oficial. La tabla de notas guarda solo calificaciones.
            </p>
            <p className="text-xs text-gray-400">
              El riesgo de este modelo no es que falle de golpe: es que las dos tablas se separen despacio y nadie lo
              note hasta que un precio salga raro. Cada contraste tiene un valor esperado — dos arrastran deuda
              histórica conocida, así que lo que importa no es que sean cero, sino que <strong>no suban</strong>.
            </p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Revisar
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          {data.totales.notas?.toLocaleString()} notas · {data.totales.con_calificacion?.toLocaleString()} con calificación ·{' '}
          {data.totales.matriculas?.toLocaleString()} matrículas · {data.totales.no_iniciadas?.toLocaleString()} sin empezar
        </p>
      </div>

      {peor.length === 0 ? (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Todos los contrastes están en su valor esperado o por debajo.
        </p>
      ) : (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl flex items-center gap-2">
          <TrendingUp className="w-4 h-4 shrink-0" />
          {peor.length === 1 ? 'Un contraste subió' : `${peor.length} contrastes subieron`} por encima de lo esperado.
        </p>
      )}

      <div className="space-y-3">
        {data.hallazgos.map(h => {
          const subio = h.n > h.esperado
          const ok = h.n <= h.esperado
          return (
            <div key={h.clave} className={`bg-white border rounded-xl overflow-hidden ${subio ? 'border-amber-300' : 'border-gray-200'}`}>
              <button onClick={() => setAbierto(abierto === h.clave ? null : h.clave)} className="w-full text-left px-5 py-4 hover:bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      {subio && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                      {h.titulo}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 max-w-3xl">{h.explica}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-2xl font-bold tabular-nums ${subio ? 'text-amber-600' : ok && h.esperado === 0 ? 'text-green-700' : 'text-gray-700'}`}>
                      {h.n.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {h.esperado === 0 ? 'debe ser 0' : `esperado ${h.esperado.toLocaleString()}`}
                    </p>
                  </div>
                </div>
              </button>
              {abierto === h.clave && (
                <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs text-gray-600"><strong>Si sube:</strong> {h.siSube}</p>
                  {h.ejemplos.length > 0 && (
                    <ul className="text-[11px] text-gray-500 space-y-0.5 font-mono">
                      {h.ejemplos.map((e, i) => <li key={i}>· {e}</li>)}
                    </ul>
                  )}
                  {h.ejemplos.length === 0 && <p className="text-[11px] text-gray-400">Sin casos.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
