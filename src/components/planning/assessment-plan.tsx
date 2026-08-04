'use client'

import { AlertTriangle, CalendarDays, Target } from 'lucide-react'
import { useIAP, SelectorAnio } from './assessment-shared'

// ---------------------------------------------------------------------------
// EL PLAN SISTÉMICO — el documento, no los números.
//
// Contesta la pregunta de estructura: qué objetivo institucional se evalúa con
// qué medidas, y en qué momento del año se recoge cada evidencia. Los
// resultados viven en el dashboard; aquí se ve el armazón.
// ---------------------------------------------------------------------------
export function AssessmentPlan() {
  const { d, anioId, cargando, error, traer } = useIAP()

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando el plan…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null

  const nombre = new Map(d.medidas.map(m => [m.code, m]))
  const delIap = d.objetivos.filter(o => o.del_iap)
  const fuera = d.objetivos.filter(o => !o.del_iap)

  return (
    <div className="space-y-6">
      <SelectorAnio d={d} anioId={anioId} cargando={cargando} traer={traer} />

      {/* Objetivos institucionales y sus medidas */}
      <div>
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Objetivos institucionales y su evidencia</h2>
        <div className="space-y-2">
          {delIap.map(o => (
            <div key={o.code} className="rounded-lg border border-gray-200 p-4">
              <p className="flex items-start gap-2 text-[13px] text-gray-800">
                <Target className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                <span><b className="text-gray-500">{o.code}</b> {o.name}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                {o.medidas.length ? o.medidas.map(c => {
                  const m = nombre.get(c)
                  return (
                    <span key={c} title={m?.name}
                      className={`rounded border px-1.5 py-0.5 text-[11px] ${
                        m?.tipo === 'directa'
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-teal-200 bg-teal-50 text-teal-700'}`}>
                      {c}{m?.binding === 'pendiente' && ' ·'}
                    </span>
                  )
                }) : (
                  <span className="text-xs text-amber-700">Sin medidas asignadas.</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          <span className="text-indigo-700">Azul</span> = medida directa · <span className="text-teal-700">verde</span> = indirecta.
          El punto (·) marca las que todavía no tienen origen decidido para este año.
        </p>
      </div>

      {/* La decisión pendiente, dicha en la pantalla y no en un correo */}
      {!!fuera.length && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {fuera.length} objetivo(s) del Plan Estratégico que el IAP no contempla
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-amber-800">
            {fuera.map(o => <li key={o.code}><b>{o.code}</b> {o.name}</li>)}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            El documento define siete objetivos institucionales; el plan estratégico tiene nueve. O el IAP se
            amplía, o estos quedan como estructura interna que no se reporta a acreditación — pero medirlos con
            cero evidencia no es una tercera opción.
          </p>
        </div>
      )}

      {/* Calendario */}
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          Calendario del ciclo anual
          <span className="font-normal text-gray-400">
            {d.anio ? `· ${d.anio.start_date} → ${d.anio.end_date}` : ''}
          </span>
        </h2>

        {!!d.cobertura.calendario_con_codigos_rotos && (
          <div className="mb-2 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800">
            <b>{d.cobertura.calendario_con_codigos_rotos} de {d.calendario.length} filas</b> apuntan a medidas que el
            inventario no define. No es un error de carga: el Apéndice A del documento referencia códigos que su
            propia Tabla 4 no tiene. Hasta que la OIQE lo reconcilie, esas actividades no se pueden ejecutar contra
            nada.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">Periodo</th>
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 font-medium">Medidas</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {d.calendario.map(c => (
                <tr key={c.seq} className={`border-t border-gray-100 ${c.desconocidas.length ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-[12px] font-medium text-gray-700">{c.periodo}</td>
                  <td className="px-3 py-2 text-[12.5px] text-gray-600">{c.actividad}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.medidas.map(m => (
                        <span key={m} className={`rounded border px-1 py-0.5 text-[10.5px] ${
                          c.desconocidas.some(x => m.includes(x))
                            ? 'border-red-300 bg-red-100 text-red-800'
                            : 'border-gray-200 bg-gray-50 text-gray-600'}`}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-500">{c.responsable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
