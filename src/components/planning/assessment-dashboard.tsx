'use client'

import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { useIAP, SelectorAnio, Tarjeta } from './assessment-shared'

// ---------------------------------------------------------------------------
// EL DASHBOARD — resultados contra estándar, por objetivo institucional.
//
// La lectura honesta de este tablero hoy no es "cómo vamos" sino "cuánto
// podemos afirmar". Con 17 de 20 medidas sin fuente, la barra de evidencia por
// objetivo es el dato más útil que existe: dice de qué se puede hablar ante un
// acreditador y de qué no.
// ---------------------------------------------------------------------------
export function AssessmentDashboard() {
  const { d, anioId, cargando, error, traer } = useIAP()

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando resultados…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null

  const c = d.cobertura
  const porCodigo = new Map(d.medidas.map(m => [m.code, m]))
  const evidencia = c.medidas ? Math.round((c.con_resultado * 100) / c.medidas) : 0

  return (
    <div className="space-y-5">
      <SelectorAnio d={d} anioId={anioId} cargando={cargando} traer={traer} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Evidencia disponible" valor={`${evidencia}%`} detalle={`${c.con_resultado} de ${c.medidas} medidas con resultado`} alerta={evidencia < 50} />
        <Tarjeta titulo="Cumplen el estándar" valor={c.cumplen} />
        <Tarjeta titulo="Bajo el estándar" valor={c.no_cumplen} detalle="candidatas a plan de mejora" alerta={c.no_cumplen > 0} />
        <Tarjeta titulo="Sin poder medirse" valor={c.sin_fuente} detalle="encuestas y rúbricas por construir" alerta={c.sin_fuente > 0} />
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <p className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
          Evidencia por objetivo institucional
        </p>
        {d.objetivos.filter(o => o.del_iap).map(o => {
          const ms = o.medidas.map(cod => porCodigo.get(cod)).filter(Boolean) as NonNullable<ReturnType<typeof porCodigo.get>>[]
          const conRes = ms.filter(m => m.resultado !== null).length
          const pct = ms.length ? Math.round((conRes * 100) / ms.length) : 0
          const bajo = ms.filter(m => m.cumple === false).length
          return (
            <div key={o.code} className="border-b border-gray-100 px-4 py-3 last:border-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-[13px] text-gray-800 max-w-2xl">
                  <b className="text-gray-500">{o.code}</b> {o.name}
                </p>
                <p className="text-xs tabular-nums text-gray-500">
                  {conRes}/{ms.length} medidas con dato
                  {!!bajo && <span className="ml-2 font-medium text-red-700">{bajo} bajo estándar</span>}
                </p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${pct >= 60 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-200'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {ms.map(m => (
                  <span key={m.code} title={`${m.name}${m.resultado !== null ? ` — ${m.resultado}` : ' — sin dato'}`}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${
                      m.cumple === true ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : m.cumple === false ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                    {m.cumple === true ? <CheckCircle2 className="h-3 w-3" />
                      : m.cumple === false ? <XCircle className="h-3 w-3" />
                      : <MinusCircle className="h-3 w-3" />}
                    {m.code}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-500">
        Un objetivo en gris no significa que se esté cumpliendo ni que se esté incumpliendo: significa que
        <b> todavía no hay con qué afirmarlo</b>. Esa distinción es la que sostiene o hunde un informe de
        acreditación, y por eso el tablero la muestra en vez de rellenarla con ceros.
      </p>
    </div>
  )
}
